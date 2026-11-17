// Staff sign-in: email + password, then a 30-day session token sent as x-staff-session.
// Every office API request needs a valid session; only customer-portal (/portal) and public (/public) routes don't.
import { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { DB } from './db.ts';
import { h } from './http.ts';
import { HttpError, localDateTime, mapUser } from './repo.ts';
import type { User } from '../shared/types.ts';

const ITERATIONS = 210_000; // OWASP guidance for PBKDF2-HMAC-SHA256
const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;
export const SESSION_HEADER = 'x-staff-session';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  return `pbkdf2$${ITERATIONS}$${salt}$${pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex')}`;
}

/** Constant-time comparison of two hex strings of equal length. */
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [scheme, iter, salt, expected] = (stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !salt || !expected) return false;
  return sameHex(pbkdf2Sync(password, salt, Number(iter), 32, 'sha256').toString('hex'), expected);
}

export function assertPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new HttpError(400, `Passwords need at least ${MIN_PASSWORD} characters`);
  return password;
}

export function createStaffSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expires = localDateTime(new Date(Date.now() + SESSION_DAYS * 86_400_000));
  db.prepare('INSERT INTO staff_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, localDateTime(), expires);
  return token;
}

function sessionUser(db: DB, req: Request): User | undefined {
  const token = req.get(SESSION_HEADER);
  if (!token) return undefined;
  const row = db
    .prepare('SELECT u.* FROM staff_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1')
    .get(sha256(token), localDateTime());
  return row ? mapUser(row) : undefined;
}

/** The signed-in staff member (set by the auth middleware). */
export const staffUser = (req: Request): User | undefined => (req as Request & { staff?: User }).staff;

// Slow down password guessing: lock an email for 15 minutes after 8 wrong passwords.
const failures = new Map<string, { count: number; until: number }>();
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60_000;

export function createAuthApi(db: DB): Router {
  const api = Router();

  api.post(
    '/auth/login',
    h((req) => {
      const email = String(req.body.email ?? '')
        .trim()
        .toLowerCase();
      const password = String(req.body.password ?? '');
      const f = failures.get(email);
      if (f && f.count >= LOCK_AFTER && f.until > Date.now()) throw new HttpError(429, 'Too many tries. Wait 15 minutes, or ask an admin to reset your password.');
      const row = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND active = 1').get(email) as Record<string, any> | undefined;
      if (!row || !verifyPassword(password, row.password_hash)) {
        const next = { count: (f && f.until > Date.now() ? f.count : 0) + 1, until: Date.now() + LOCK_MS };
        failures.set(email, next);
        throw new HttpError(401, 'That email and password don’t match');
      }
      failures.delete(email);
      return { session: createStaffSession(db, row.id), user: mapUser(row) };
    }),
  );

  // Everything below (and every router mounted after this one) needs a signed-in staff member.
  api.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path.startsWith('/portal/') || req.path.startsWith('/public/')) return next();
    const user = sessionUser(db, req);
    if (!user) return next(new HttpError(401, 'Please sign in'));
    (req as Request & { staff?: User }).staff = user;
    next();
  });

  api.get(
    '/auth/me',
    h((req) => staffUser(req)),
  );

  api.post(
    '/auth/logout',
    h((req) => {
      db.prepare('DELETE FROM staff_sessions WHERE token_hash = ?').run(sha256(req.get(SESSION_HEADER) ?? ''));
    }),
  );

  api.post(
    '/auth/password',
    h((req) => {
      const me = staffUser(req)!;
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(me.id) as { password_hash: string | null };
      if (!verifyPassword(String(req.body.current ?? ''), row.password_hash)) throw new HttpError(400, 'Your current password is incorrect');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(assertPassword(req.body.next)), me.id);
      // Sign out other devices.
      db.prepare('DELETE FROM staff_sessions WHERE user_id = ? AND token_hash != ?').run(me.id, sha256(req.get(SESSION_HEADER) ?? ''));
    }),
  );

  return api;
}

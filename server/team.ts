// Team members: roles, permissions, hourly cost rates.
import { Router } from 'express';
import type { DB } from './db.ts';
import { assertOneOf, h, id, patch, required } from './http.ts';
import { HttpError, mapUser } from './repo.ts';
import { assertPassword, hashPassword, staffUser } from './auth.ts';
import { PERMISSIONS, ROLE_DEFAULTS, userCan, type Permission, type Role } from '../shared/types.ts';

const ROLES: Role[] = ['owner', 'manager', 'technician', 'office'];

function cleanPermissions(v: unknown): Permission[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'permissions must be a list');
  return PERMISSIONS.filter((p) => v.includes(p));
}

function percent(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Commission must be between 0 and 100%');
  return Math.round(n * 100) / 100;
}

function rate(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Hourly rate must be 0 or more');
  return Math.round(n * 100) / 100;
}

export function createTeamApi(db: DB): Router {
  const api = Router();
  const get = (userId: number) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) throw new HttpError(404, 'Team member not found');
    return mapUser(row);
  };

  // Keep at least one active member who can manage the team, so nobody gets locked out.
  function assertManagerRemains() {
    const managers = db
      .prepare('SELECT * FROM users WHERE active = 1')
      .all()
      .map(mapUser)
      .filter((u) => u.permissions.includes('manage_team'));
    if (!managers.length) throw new HttpError(409, 'At least one active member must be able to manage the team');
  }

  // Adding members, changing rates/permissions and setting passwords needs Manage team.
  const assertManager = (req: Parameters<typeof staffUser>[0]) => {
    if (!userCan(staffUser(req), 'manage_team')) throw new HttpError(403, 'Only people who manage the team can do that');
  };

  api.post(
    '/users',
    h((req) => {
      assertManager(req);
      const b = req.body;
      const role = assertOneOf(b.role ?? 'technician', ROLES, 'role');
      const email = required(b, 'email').toLowerCase();
      if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new HttpError(409, 'Someone on the team already uses that email');
      const r = db
        .prepare('INSERT INTO users (name, email, phone, role, color, division_ids, hourly_rate, commission_rate, permissions, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          required(b, 'name'),
          email,
          b.phone || null,
          role,
          b.color ?? '#64748b',
          JSON.stringify(b.divisionIds ?? []),
          rate(b.hourlyRate ?? 0),
          percent(b.commissionRate ?? 0),
          JSON.stringify(b.permissions ? cleanPermissions(b.permissions) : ROLE_DEFAULTS[role]),
          b.password ? hashPassword(assertPassword(b.password)) : null,
        );
      return get(Number(r.lastInsertRowid));
    }),
  );

  api.patch(
    '/users/:id',
    h((req) => {
      assertManager(req);
      const b = req.body;
      if ('role' in b) assertOneOf(b.role, ROLES, 'role');
      if ('email' in b) {
        const clash = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(String(b.email), id(req));
        if (clash) throw new HttpError(409, 'Someone on the team already uses that email');
      }
      db.exec('BEGIN');
      try {
        patch(db, 'users', id(req), b, {
          name: 'name',
          email: 'email',
          phone: 'phone',
          role: 'role',
          color: 'color',
          divisionIds: (v) => ['division_ids', JSON.stringify(Array.isArray(v) ? v.map(Number) : [])],
          hourlyRate: (v) => ['hourly_rate', rate(v)],
          commissionRate: (v) => ['commission_rate', percent(v)],
          permissions: (v) => ['permissions', JSON.stringify(cleanPermissions(v))],
          active: (v) => ['active', v ? 1 : 0],
          password: (v) => ['password_hash', hashPassword(assertPassword(v))],
        });
        // A new password (or deactivation) signs them out everywhere.
        if ('password' in b || b.active === false) db.prepare('DELETE FROM staff_sessions WHERE user_id = ?').run(id(req));
        assertManagerRemains();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return get(id(req));
    }),
  );

  return api;
}

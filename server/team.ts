// Team members: roles, permissions, hourly cost rates.
import { Router } from 'express';
import type { DB } from './db.ts';
import { assertOneOf, h, id, patch, required } from './http.ts';
import { HttpError, mapUser } from './repo.ts';
import { PERMISSIONS, ROLE_DEFAULTS, type Permission, type Role } from '../shared/types.ts';

const ROLES: Role[] = ['owner', 'manager', 'technician', 'office'];

function cleanPermissions(v: unknown): Permission[] {
  if (!Array.isArray(v)) throw new HttpError(400, 'permissions must be a list');
  return PERMISSIONS.filter((p) => v.includes(p));
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

  api.post(
    '/users',
    h((req) => {
      const b = req.body;
      const role = assertOneOf(b.role ?? 'technician', ROLES, 'role');
      const email = required(b, 'email').toLowerCase();
      if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) throw new HttpError(409, 'Someone on the team already uses that email');
      const r = db
        .prepare('INSERT INTO users (name, email, phone, role, color, division_ids, hourly_rate, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          required(b, 'name'),
          email,
          b.phone || null,
          role,
          b.color ?? '#64748b',
          JSON.stringify(b.divisionIds ?? []),
          rate(b.hourlyRate ?? 0),
          JSON.stringify(b.permissions ? cleanPermissions(b.permissions) : ROLE_DEFAULTS[role]),
        );
      return get(Number(r.lastInsertRowid));
    }),
  );

  api.patch(
    '/users/:id',
    h((req) => {
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
          permissions: (v) => ['permissions', JSON.stringify(cleanPermissions(v))],
          active: (v) => ['active', v ? 1 : 0],
        });
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

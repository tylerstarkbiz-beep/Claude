// Small helpers shared by the API routers.
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './repo.ts';
import type { DB } from './db.ts';

type Handler = (req: Request, res: Response) => unknown;

/** Wrap a handler (sync or async) so its return value is sent as JSON and thrown errors become JSON responses. */
export const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    const send = (out: unknown) => {
      if (!res.headersSent) res.json(out ?? { ok: true });
    };
    try {
      const out = fn(req, res);
      if (out instanceof Promise) out.then(send, next);
      else send(out);
    } catch (err) {
      next(err);
    }
  };

export const id = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n)) throw new HttpError(400, `Invalid ${name}`);
  return n;
};

export const optNum = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

export function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new HttpError(400, `Invalid ${label}: ${String(value)}`);
  return value as T;
}

export function required(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${key} is required`);
  return v.trim();
}

/** Build an UPDATE from whichever whitelisted fields are present in the body. */
export function patch(
  db: DB,
  table: string,
  rowId: number,
  body: Record<string, unknown>,
  columns: Record<string, string | ((v: unknown) => [string, unknown])>,
  touch = false,
) {
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, col] of Object.entries(columns)) {
    if (!(key in body)) continue;
    if (typeof col === 'function') {
      const [c, v] = col(body[key]);
      sets.push(`${c} = ?`);
      values.push(v);
    } else {
      sets.push(`${col} = ?`);
      values.push(body[key] === '' ? null : (body[key] ?? null));
    }
  }
  if (touch) sets.push("updated_at = datetime('now')");
  if (!sets.length) return;
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values, rowId);
}

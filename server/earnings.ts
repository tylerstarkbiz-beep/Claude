// Commissions & tips. Each person's tracker is private: only they and people with manage_pay can read it.
// Every request is checked against the acting user on the server, not just hidden in the UI.
import { Router, type Request } from 'express';
import type { DB } from './db.ts';
import { h, id, optNum } from './http.ts';
import { HttpError, getJob, localDate, localDateTime, mapUser } from './repo.ts';
import { userCan, type Earning, type EarningKind, type EarningTotals, type EarningsSummary, type TeamEarningsRow, type User } from '../shared/types.ts';

type Row = Record<string, any>;
const cents = (n: number) => Math.round(n * 100) / 100;
const MONTH = /^\d{4}-\d{2}$/;

/**
 * Who is making the request. Until staff sign-in exists this is the "Viewing as" person, sent as x-user-id;
 * when logins land, swap this for the signed-in session and every check below keeps working.
 */
export function actingUser(db: DB, req: Request): User | undefined {
  const raw = req.get('x-user-id');
  const userId = raw ? Number(raw) : NaN;
  if (!Number.isInteger(userId)) return undefined;
  const row = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId);
  return row ? mapUser(row) : undefined;
}

function requireActor(db: DB, req: Request): User {
  const me = actingUser(db, req);
  if (!me) throw new HttpError(401, 'Choose who you are first');
  return me;
}

/** Only the person themselves, or someone who manages pay, may see a tracker. */
function assertCanSee(me: User, userId: number) {
  if (me.id !== userId && !userCan(me, 'manage_pay')) throw new HttpError(403, 'You can only see your own commissions and tips');
}

const mapEarning = (r: Row): Earning => ({
  id: r.id,
  userId: r.user_id,
  jobId: r.job_id,
  jobNumber: r.job_number ?? null,
  jobTitle: r.job_title ?? null,
  kind: r.kind,
  amount: r.amount,
  note: r.note,
  earnedOn: r.earned_on,
  createdBy: r.created_by,
  createdAt: r.created_at,
  paidOutAt: r.paid_out_at,
});

const SELECT = `SELECT e.*, j.number AS job_number, j.title AS job_title FROM earnings e LEFT JOIN jobs j ON j.id = e.job_id`;

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function totals(db: DB, userId: number, month: string): EarningTotals {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'commission' THEN amount END), 0) AS commission,
              COALESCE(SUM(CASE WHEN kind = 'tip' THEN amount END), 0) AS tip
       FROM earnings WHERE user_id = ? AND substr(earned_on, 1, 7) = ?`,
    )
    .get(userId, month) as Row;
  return { commission: cents(r.commission), tip: cents(r.tip), total: cents(r.commission + r.tip) };
}

const unpaid = (db: DB, userId: number) =>
  cents((db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM earnings WHERE user_id = ? AND paid_out_at IS NULL').get(userId) as Row).n);

export function summary(db: DB, userId: number, month: string): EarningsSummary {
  const history = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => ({ month: m, ...totals(db, userId, m) }));
  const pick = ({ commission, tip, total }: EarningTotals): EarningTotals => ({ commission, tip, total });
  return {
    userId,
    month,
    totals: pick(history[5]),
    lastMonth: pick(history[4]),
    unpaid: unpaid(db, userId),
    history,
    entries: db
      .prepare(`${SELECT} WHERE e.user_id = ? AND substr(e.earned_on, 1, 7) = ? ORDER BY e.earned_on DESC, e.id DESC`)
      .all(userId, month)
      .map(mapEarning),
  };
}

const getEarning = (db: DB, earningId: number) => {
  const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(earningId);
  if (!row) throw new HttpError(404, 'Entry not found');
  return mapEarning(row);
};

/** Logging rules: commissions need manage_pay; anyone may log their own tips. */
function assertCanWrite(me: User, kind: EarningKind, userId: number) {
  if (userCan(me, 'manage_pay')) return;
  if (kind === 'commission') throw new HttpError(403, 'Only owners and admins can log commissions');
  if (userId !== me.id) throw new HttpError(403, 'You can only log your own tips');
}

function input(db: DB, b: Row, current?: Earning) {
  const kind = (b.kind ?? current?.kind) as EarningKind;
  if (kind !== 'commission' && kind !== 'tip') throw new HttpError(400, 'Choose commission or tip');
  const amount = cents(Number(b.amount ?? current?.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount greater than 0');
  const userId = Number(b.userId ?? current?.userId);
  const user = db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(400, 'Choose who earned it');
  const jobId = 'jobId' in b ? optNum(b.jobId) : (current?.jobId ?? null);
  if (jobId != null && !getJob(db, jobId)) throw new HttpError(400, 'Job not found');
  const earnedOn = b.earnedOn ?? current?.earnedOn ?? localDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(earnedOn)) throw new HttpError(400, 'Invalid date');
  return {
    kind,
    amount,
    userId,
    jobId,
    earnedOn,
    note: String(b.note ?? current?.note ?? '')
      .trim()
      .slice(0, 500),
  };
}

export function createEarningsApi(db: DB): Router {
  const api = Router();

  api.get(
    '/earnings',
    h((req) => {
      const me = requireActor(db, req);
      const userId = optNum(req.query.userId) ?? me.id;
      assertCanSee(me, userId);
      const month = typeof req.query.month === 'string' && MONTH.test(req.query.month) ? req.query.month : localDate().slice(0, 7);
      return summary(db, userId, month);
    }),
  );

  api.get(
    '/earnings/team',
    h((req): TeamEarningsRow[] => {
      const me = requireActor(db, req);
      if (!userCan(me, 'manage_pay')) throw new HttpError(403, 'Only owners and admins can see the team’s earnings');
      const month = typeof req.query.month === 'string' && MONTH.test(req.query.month) ? req.query.month : localDate().slice(0, 7);
      const users = db
        .prepare('SELECT id FROM users WHERE active = 1 OR id IN (SELECT user_id FROM earnings WHERE substr(earned_on, 1, 7) = ?) ORDER BY name')
        .all(month) as Row[];
      return users.map((u) => ({ userId: u.id, ...totals(db, u.id, month), unpaid: unpaid(db, u.id) }));
    }),
  );

  // A job's entries: everything for pay managers, only your own for everyone else.
  api.get(
    '/jobs/:id/earnings',
    h((req) => {
      const me = requireActor(db, req);
      const all = userCan(me, 'manage_pay');
      return db
        .prepare(`${SELECT} WHERE e.job_id = ? ${all ? '' : 'AND e.user_id = ?'} ORDER BY e.earned_on, e.id`)
        .all(...(all ? [id(req)] : [id(req), me.id]))
        .map(mapEarning);
    }),
  );

  api.post(
    '/earnings',
    h((req) => {
      const me = requireActor(db, req);
      const e = input(db, { userId: me.id, ...req.body });
      assertCanWrite(me, e.kind, e.userId);
      const r = db
        .prepare('INSERT INTO earnings (user_id, job_id, kind, amount, note, earned_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(e.userId, e.jobId, e.kind, e.amount, e.note, e.earnedOn, me.id, localDateTime());
      return getEarning(db, Number(r.lastInsertRowid));
    }),
  );

  api.patch(
    '/earnings/:id',
    h((req) => {
      const me = requireActor(db, req);
      const current = getEarning(db, id(req));
      assertCanWrite(me, current.kind, current.userId);
      if (current.paidOutAt && !userCan(me, 'manage_pay')) throw new HttpError(409, 'This was already paid out');
      const e = input(db, req.body, current);
      assertCanWrite(me, e.kind, e.userId);
      db.prepare('UPDATE earnings SET user_id = ?, job_id = ?, kind = ?, amount = ?, note = ?, earned_on = ? WHERE id = ?').run(
        e.userId,
        e.jobId,
        e.kind,
        e.amount,
        e.note,
        e.earnedOn,
        id(req),
      );
      return getEarning(db, id(req));
    }),
  );

  api.delete(
    '/earnings/:id',
    h((req) => {
      const me = requireActor(db, req);
      const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id(req));
      if (!row) return;
      const current = mapEarning(row);
      assertCanWrite(me, current.kind, current.userId);
      if (current.paidOutAt && !userCan(me, 'manage_pay')) throw new HttpError(409, 'This was already paid out');
      db.prepare('DELETE FROM earnings WHERE id = ?').run(id(req));
    }),
  );

  // Mark everything owed to someone through the end of a month as paid (e.g. after running payroll), or undo it.
  api.post(
    '/earnings/payout',
    h((req) => {
      const me = requireActor(db, req);
      if (!userCan(me, 'manage_pay')) throw new HttpError(403, 'Only owners and admins can mark payouts');
      const userId = Number(req.body.userId);
      const month = String(req.body.month ?? '');
      if (!MONTH.test(month)) throw new HttpError(400, 'Choose a month');
      if (req.body.undo) {
        db.prepare('UPDATE earnings SET paid_out_at = NULL WHERE user_id = ? AND substr(earned_on, 1, 7) = ?').run(userId, month);
      } else {
        db.prepare('UPDATE earnings SET paid_out_at = ? WHERE user_id = ? AND paid_out_at IS NULL AND substr(earned_on, 1, 7) <= ?').run(
          localDateTime(),
          userId,
          month,
        );
      }
      return summary(db, userId, month);
    }),
  );

  return api;
}

/** Pay rates are private too: strip other people's rates unless the viewer manages the team or pay. */
export function visibleUser(me: User | undefined, u: User): User {
  if (me && (me.id === u.id || userCan(me, 'manage_team') || userCan(me, 'manage_pay'))) return u;
  // Hourly cost already shows in job costing for people who see financials; commission rates don't.
  return { ...u, hourlyRate: me && userCan(me, 'view_financials') ? u.hourlyRate : 0, commissionRate: 0 };
}

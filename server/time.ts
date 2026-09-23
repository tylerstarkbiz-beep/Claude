// Time tracking (clock in/out, job timers, timesheets) and per-employee daily logs.
import { Router } from 'express';
import { logActivity, tx, type DB } from './db.ts';
import { h, id, optNum, patch, required } from './http.ts';
import { setJobStatus } from './automations.ts';
import { loadNotes } from './notes.ts';
import { HttpError, JOB_SELECT, TASK_SELECT, getJob, localDate, localDateTime, mapJob, mapTask, mapUser } from './repo.ts';
import type { ChecklistTemplate, DailyItem, DailyLog, DailyReport, DailySummary, TimeEntry, User } from '../shared/types.ts';

type Row = Record<string, any>;

const TIME_SELECT = `
  SELECT te.*, j.number AS job_number, j.title AS job_title, j.division_id AS job_division_id
  FROM time_entries te LEFT JOIN jobs j ON j.id = te.job_id`;

const mapEntry = (r: Row): TimeEntry => ({
  id: r.id,
  userId: r.user_id,
  jobId: r.job_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  notes: r.notes,
  job: r.job_number ? { number: r.job_number, title: r.job_title, divisionId: r.job_division_id } : null,
});

const mapItem = (r: Row): DailyItem => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  title: r.title,
  doneAt: r.done_at,
  templateId: r.template_id,
  createdBy: r.created_by,
});

const mapTemplate = (r: Row): ChecklistTemplate => ({
  id: r.id,
  title: r.title,
  userId: r.user_id,
  role: r.role,
  divisionId: r.division_id,
  active: !!r.active,
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function dateParam(v: unknown): string {
  if (typeof v !== 'string' || !DATE.test(v)) throw new HttpError(400, 'Dates must be YYYY-MM-DD');
  return v;
}

/** Minutes covered by an entry; open entries count up to now. */
export function entryMinutes(e: TimeEntry, now = new Date()): number {
  const end = e.endedAt ? new Date(e.endedAt) : now;
  return Math.max(0, Math.round((end.getTime() - new Date(e.startedAt).getTime()) / 60000));
}

function getUser(db: DB, userId: number): User {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) throw new HttpError(404, 'User not found');
  return mapUser(row);
}

export function openEntry(db: DB, userId: number): TimeEntry | null {
  const row = db.prepare(`${TIME_SELECT} WHERE te.user_id = ? AND te.ended_at IS NULL ORDER BY te.started_at DESC LIMIT 1`).get(userId);
  return row ? mapEntry(row) : null;
}

function entriesForDay(db: DB, userId: number, date: string): TimeEntry[] {
  return db
    .prepare(`${TIME_SELECT} WHERE te.user_id = ? AND substr(te.started_at, 1, 10) = ? ORDER BY te.started_at`)
    .all(userId, date)
    .map(mapEntry);
}

/**
 * Copy matching checklist templates onto a user's list for a date. Only for today and future days,
 * so editing templates never rewrites history.
 */
function materializeChecklist(db: DB, user: User, date: string) {
  if (date < localDate()) return;
  const templates = db
    .prepare('SELECT * FROM checklist_templates WHERE active = 1 ORDER BY position, id')
    .all()
    .map(mapTemplate)
    .filter(
      (t) =>
        (t.userId === null || t.userId === user.id) &&
        (t.role === null || t.role === user.role) &&
        (t.divisionId === null || user.divisionIds.includes(t.divisionId)),
    );
  const insert = db.prepare('INSERT OR IGNORE INTO daily_items (user_id, date, title, template_id, position) VALUES (?, ?, ?, ?, ?)');
  templates.forEach((t, i) => insert.run(user.id, date, t.title, t.id, i));
}

function getReport(db: DB, userId: number, date: string): DailyReport {
  const r = db.prepare('SELECT * FROM daily_reports WHERE user_id = ? AND date = ?').get(userId, date);
  return {
    summary: (r?.summary as string) ?? '',
    issues: (r?.issues as string) ?? '',
    tomorrow: (r?.tomorrow as string) ?? '',
    submittedAt: (r?.submitted_at as string) ?? null,
    reviewedBy: (r?.reviewed_by as number) ?? null,
    reviewedAt: (r?.reviewed_at as string) ?? null,
  };
}

export function buildDailyLog(db: DB, userId: number, date: string): DailyLog {
  const user = getUser(db, userId);
  materializeChecklist(db, user, date);
  const items = db.prepare('SELECT * FROM daily_items WHERE user_id = ? AND date = ? ORDER BY position, id').all(userId, date).map(mapItem);
  const timeEntries = entriesForDay(db, userId, date);
  const now = new Date();
  const totalMinutes = timeEntries.reduce((a, e) => a + entryMinutes(e, now), 0);
  const jobMinutes = timeEntries.filter((e) => e.jobId).reduce((a, e) => a + entryMinutes(e, now), 0);

  // Jobs they were scheduled on, plus any they logged time against.
  const jobs = db
    .prepare(
      `${JOB_SELECT} WHERE (j.assignee_id = ? AND substr(j.scheduled_start, 1, 10) = ?)
         OR j.id IN (SELECT job_id FROM time_entries WHERE user_id = ? AND substr(started_at, 1, 10) = ?)
       ORDER BY j.scheduled_start`,
    )
    .all(userId, date, userId, date)
    .map(mapJob);

  const tasksCompleted = db
    .prepare(`${TASK_SELECT} WHERE t.assignee_id = ? AND substr(t.completed_at, 1, 10) = ? ORDER BY t.completed_at`)
    .all(userId, date)
    .map(mapTask);

  // On today's log, show everything open that is due or overdue; on other days, what was due that day.
  const tasksOpen = db
    .prepare(
      `${TASK_SELECT} WHERE t.assignee_id = ? AND t.status != 'done' AND ${date === localDate() ? 't.due_date <= ?' : 't.due_date = ?'}
       ORDER BY t.due_date`,
    )
    .all(userId, date)
    .map(mapTask);

  const notes = loadNotes(db, 'n.author_id = ? AND substr(n.created_at, 1, 10) = ?', [userId, date]);

  return { userId, date, items, report: getReport(db, userId, date), timeEntries, totalMinutes, jobMinutes, jobs, tasksCompleted, tasksOpen, notes };
}

export function createTimeApi(db: DB): Router {
  const api = Router();

  // ---------- Clock ----------

  api.get(
    '/time/status/:userId',
    h((req) => {
      const userId = id(req, 'userId');
      const entry = openEntry(db, userId);
      const todayMinutes = entriesForDay(db, userId, localDate()).reduce((a, e) => a + entryMinutes(e), 0);
      return { entry, todayMinutes };
    }),
  );

  /** Clock in, or switch what you're working on. Closes any open entry first. */
  api.post(
    '/time/clock-in',
    h((req) => {
      const user = getUser(db, Number(req.body.userId));
      const jobId = optNum(req.body.jobId);
      const job = jobId ? getJob(db, jobId) : null;
      if (jobId && !job) throw new HttpError(400, 'Job not found');
      return tx(db, () => {
        const now = localDateTime();
        const open = openEntry(db, user.id);
        if (open && open.jobId === jobId) return { entry: open, automations: [] };
        if (open) db.prepare('UPDATE time_entries SET ended_at = ? WHERE id = ?').run(now, open.id);
        const r = db
          .prepare('INSERT INTO time_entries (user_id, job_id, started_at, notes, hourly_rate) VALUES (?, ?, ?, ?, ?)')
          .run(user.id, jobId, now, req.body.notes || null, user.hourlyRate);
        let automations: string[] = [];
        if (job) {
          logActivity(db, 'time', `${user.name} started work on ${job.number}`, { jobId: job.id });
          // Starting the clock on a scheduled job means the crew is on it.
          if (['request', 'quoted', 'scheduled'].includes(job.status)) automations = setJobStatus(db, job.id, 'in_progress');
        }
        const entry = mapEntry(db.prepare(`${TIME_SELECT} WHERE te.id = ?`).get(r.lastInsertRowid)!);
        return { entry, automations };
      });
    }),
  );

  api.post(
    '/time/clock-out',
    h((req) => {
      const userId = Number(req.body.userId);
      const open = openEntry(db, userId);
      if (open) db.prepare('UPDATE time_entries SET ended_at = ? WHERE id = ?').run(localDateTime(), open.id);
      return { entry: null };
    }),
  );

  // ---------- Entries & timesheets ----------

  api.get(
    '/time',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      const q = req.query;
      if (q.userId) (where.push('te.user_id = ?'), params.push(Number(q.userId)));
      if (q.jobId) (where.push('te.job_id = ?'), params.push(Number(q.jobId)));
      if (q.from) (where.push('substr(te.started_at, 1, 10) >= ?'), params.push(dateParam(q.from)));
      if (q.to) (where.push('substr(te.started_at, 1, 10) <= ?'), params.push(dateParam(q.to)));
      return db
        .prepare(`${TIME_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY te.started_at`)
        .all(...params)
        .map(mapEntry);
    }),
  );

  // Manual entry, e.g. a manager fixing a forgotten clock-in.
  api.post(
    '/time',
    h((req) => {
      const b = req.body;
      const startedAt = required(b, 'startedAt');
      if (b.endedAt && b.endedAt <= startedAt) throw new HttpError(400, 'End must be after start');
      const user = getUser(db, Number(b.userId));
      const r = db
        .prepare('INSERT INTO time_entries (user_id, job_id, started_at, ended_at, notes, hourly_rate) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, optNum(b.jobId), startedAt, b.endedAt || null, b.notes || null, user.hourlyRate);
      return mapEntry(db.prepare(`${TIME_SELECT} WHERE te.id = ?`).get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/time/:id',
    h((req) => {
      patch(db, 'time_entries', id(req), req.body, {
        startedAt: 'started_at',
        endedAt: 'ended_at',
        notes: 'notes',
        jobId: (v) => ['job_id', optNum(v)],
      });
      const row = db.prepare(`${TIME_SELECT} WHERE te.id = ?`).get(id(req));
      if (!row) throw new HttpError(404, 'Entry not found');
      const e = mapEntry(row);
      if (e.endedAt && e.endedAt <= e.startedAt) throw new HttpError(400, 'End must be after start');
      return e;
    }),
  );

  api.delete(
    '/time/:id',
    h((req) => {
      db.prepare('DELETE FROM time_entries WHERE id = ?').run(id(req));
    }),
  );

  /** Minutes per user per day for a date range (default: 7 days from `from`). */
  api.get(
    '/timesheets',
    h((req) => {
      const from = dateParam(req.query.from ?? localDate());
      const days = Math.min(31, Math.max(1, Number(req.query.days) || 7));
      const end = new Date(from + 'T00:00');
      end.setDate(end.getDate() + days - 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
      const entries = db
        .prepare(`${TIME_SELECT} WHERE substr(te.started_at, 1, 10) BETWEEN ? AND ?`)
        .all(from, to)
        .map(mapEntry);
      const users = db.prepare('SELECT id FROM users ORDER BY name').all() as { id: number }[];
      const costs = new Map(
        (
          db
            .prepare(
              `SELECT te.user_id, SUM((julianday(COALESCE(te.ended_at, :now)) - julianday(te.started_at)) * 24 * COALESCE(te.hourly_rate, u.hourly_rate, 0)) AS cost
               FROM time_entries te JOIN users u ON u.id = te.user_id
               WHERE substr(te.started_at, 1, 10) BETWEEN :from AND :to GROUP BY te.user_id`,
            )
            .all({ now: localDateTime(), from, to }) as { user_id: number; cost: number }[]
        ).map((r) => [r.user_id, Math.round(r.cost * 100) / 100]),
      );
      const now = new Date();
      return {
        from,
        to,
        users: users.map((u) => {
          const mine = entries.filter((e) => e.userId === u.id);
          const byDay: Record<string, number> = {};
          let jobMinutes = 0;
          for (const e of mine) {
            const m = entryMinutes(e, now);
            byDay[e.startedAt.slice(0, 10)] = (byDay[e.startedAt.slice(0, 10)] ?? 0) + m;
            if (e.jobId) jobMinutes += m;
          }
          return { userId: u.id, days: byDay, totalMinutes: Object.values(byDay).reduce((a, b) => a + b, 0), jobMinutes, laborCost: costs.get(u.id) ?? 0 };
        }),
      };
    }),
  );

  // ---------- Daily logs ----------

  api.get(
    '/daily',
    h((req): DailySummary[] => {
      const date = dateParam(req.query.date ?? localDate());
      const users = db.prepare('SELECT * FROM users ORDER BY name').all().map(mapUser);
      return users.map((u) => {
        const log = buildDailyLog(db, u.id, date);
        const open = openEntry(db, u.id);
        return {
          userId: u.id,
          totalMinutes: log.totalMinutes,
          clockedIn: !!open && date === localDate(),
          currentJobId: open?.jobId ?? null,
          itemsDone: log.items.filter((i) => i.doneAt).length,
          itemsTotal: log.items.length,
          tasksCompleted: log.tasksCompleted.length,
          jobs: log.jobs.length,
          notes: log.notes.length,
          submitted: !!log.report.submittedAt,
          reviewed: !!log.report.reviewedAt,
        };
      });
    }),
  );

  api.get(
    '/daily/:userId/:date',
    h((req) => buildDailyLog(db, id(req, 'userId'), dateParam(req.params.date))),
  );

  // Ad hoc checklist item for one person on one day (e.g. assigned by a manager).
  api.post(
    '/daily/:userId/:date/items',
    h((req) => {
      const userId = id(req, 'userId');
      const date = dateParam(req.params.date);
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM daily_items WHERE user_id = ? AND date = ?').get(userId, date) as { p: number };
      const r = db
        .prepare('INSERT INTO daily_items (user_id, date, title, created_by, position) VALUES (?, ?, ?, ?, ?)')
        .run(userId, date, required(req.body, 'title'), optNum(req.body.createdBy), pos.p);
      return mapItem(db.prepare('SELECT * FROM daily_items WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/daily-items/:id',
    h((req) => {
      if ('done' in req.body) db.prepare('UPDATE daily_items SET done_at = ? WHERE id = ?').run(req.body.done ? localDateTime() : null, id(req));
      if (typeof req.body.title === 'string' && req.body.title.trim()) {
        db.prepare('UPDATE daily_items SET title = ? WHERE id = ?').run(req.body.title.trim(), id(req));
      }
      const row = db.prepare('SELECT * FROM daily_items WHERE id = ?').get(id(req));
      if (!row) throw new HttpError(404, 'Item not found');
      return mapItem(row);
    }),
  );

  api.delete(
    '/daily-items/:id',
    h((req) => {
      db.prepare('DELETE FROM daily_items WHERE id = ?').run(id(req));
    }),
  );

  /** Save the end-of-day report; `submit: true` marks it submitted for review. */
  api.put(
    '/daily/:userId/:date/report',
    h((req) => {
      const userId = id(req, 'userId');
      const date = dateParam(req.params.date);
      const b = req.body;
      const existing = getReport(db, userId, date);
      const submittedAt = b.submit ? localDateTime() : existing.submittedAt;
      db.prepare(
        `INSERT INTO daily_reports (user_id, date, summary, issues, tomorrow, submitted_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET summary = excluded.summary, issues = excluded.issues,
           tomorrow = excluded.tomorrow, submitted_at = excluded.submitted_at`,
      ).run(userId, date, String(b.summary ?? ''), String(b.issues ?? ''), String(b.tomorrow ?? ''), submittedAt);
      if (b.submit) {
        // A resubmitted report needs a fresh sign-off.
        db.prepare('UPDATE daily_reports SET reviewed_by = NULL, reviewed_at = NULL WHERE user_id = ? AND date = ?').run(userId, date);
        logActivity(db, 'daily', `${getUser(db, userId).name} submitted their daily log for ${date}`);
      }
      return getReport(db, userId, date);
    }),
  );

  api.post(
    '/daily/:userId/:date/review',
    h((req) => {
      const userId = id(req, 'userId');
      const date = dateParam(req.params.date);
      const undo = !!req.body.undo;
      db.prepare(
        `INSERT INTO daily_reports (user_id, date, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`,
      ).run(userId, date, undo ? null : optNum(req.body.reviewerId), undo ? null : localDateTime());
      return getReport(db, userId, date);
    }),
  );

  // ---------- Checklist templates ----------

  api.get(
    '/checklist-templates',
    h(() => db.prepare('SELECT * FROM checklist_templates ORDER BY position, id').all().map(mapTemplate)),
  );

  api.post(
    '/checklist-templates',
    h((req) => {
      const b = req.body;
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM checklist_templates').get() as { p: number };
      const r = db
        .prepare('INSERT INTO checklist_templates (title, user_id, role, division_id, position) VALUES (?, ?, ?, ?, ?)')
        .run(required(b, 'title'), optNum(b.userId), b.role || null, optNum(b.divisionId), pos.p);
      return mapTemplate(db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/checklist-templates/:id',
    h((req) => {
      patch(db, 'checklist_templates', id(req), req.body, {
        title: 'title',
        role: 'role',
        userId: (v) => ['user_id', optNum(v)],
        divisionId: (v) => ['division_id', optNum(v)],
        active: (v) => ['active', v ? 1 : 0],
      });
      return mapTemplate(db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(id(req))!);
    }),
  );

  api.delete(
    '/checklist-templates/:id',
    h((req) => {
      // Unchecked items from today on go away with the template; completed history stays.
      db.prepare('DELETE FROM daily_items WHERE template_id = ? AND done_at IS NULL AND date >= ?').run(id(req), localDate());
      db.prepare('DELETE FROM checklist_templates WHERE id = ?').run(id(req));
    }),
  );

  return api;
}

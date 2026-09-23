import { Router, type Request, type Response, type NextFunction } from 'express';
import { logActivity, tx, type DB } from './db.ts';
import { runAutomations } from './automations.ts';
import {
  HttpError,
  JOB_SELECT,
  TASK_SELECT,
  createTask,
  getClient,
  getJob,
  getTask,
  localDate,
  mapAutomation,
  mapBoard,
  mapClient,
  mapDivision,
  mapGroup,
  mapJob,
  mapLineItem,
  mapTask,
  mapTaskUpdate,
  mapUser,
  nextJobNumber,
} from './repo.ts';
import {
  JOB_STATUSES,
  JOB_STATUS_META,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_META,
  type DashboardStats,
  type JobStatus,
  type TaskStatus,
} from '../shared/types.ts';

type Handler = (req: Request, res: Response) => unknown;

/** Wrap a sync handler so thrown errors become JSON responses. */
const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      next(err);
    }
  };

const id = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n)) throw new HttpError(400, `Invalid ${name}`);
  return n;
};

const optNum = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

function assertOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new HttpError(400, `Invalid ${label}: ${String(value)}`);
  return value as T;
}

function required(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${key} is required`);
  return v.trim();
}

/** Build an UPDATE from whichever whitelisted fields are present in the body. */
function patch(
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

export function createApi(db: DB): Router {
  const api = Router();

  // ---------- Bootstrap / reference data ----------
  api.get(
    '/bootstrap',
    h(() => ({
      divisions: db.prepare('SELECT * FROM divisions ORDER BY id').all().map(mapDivision),
      users: db.prepare('SELECT * FROM users ORDER BY name').all().map(mapUser),
      boards: db.prepare('SELECT * FROM boards ORDER BY division_id IS NULL, division_id, name').all().map(mapBoard),
    })),
  );

  api.patch(
    '/divisions/:id',
    h((req) => {
      patch(db, 'divisions', id(req), req.body, {
        name: 'name',
        color: 'color',
        prefix: 'prefix',
        fields: (v) => ['fields', JSON.stringify(v ?? [])],
      });
      return mapDivision(db.prepare('SELECT * FROM divisions WHERE id = ?').get(id(req))!);
    }),
  );

  api.post(
    '/users',
    h((req) => {
      const r = db
        .prepare('INSERT INTO users (name, email, role, color, division_ids) VALUES (?, ?, ?, ?, ?)')
        .run(
          required(req.body, 'name'),
          required(req.body, 'email'),
          assertOneOf(req.body.role ?? 'technician', ['owner', 'manager', 'technician', 'office'], 'role'),
          req.body.color ?? '#64748b',
          JSON.stringify(req.body.divisionIds ?? []),
        );
      return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  // ---------- Clients ----------
  api.get(
    '/clients',
    h((req) => {
      const q = typeof req.query.q === 'string' ? `%${req.query.q}%` : null;
      const rows = q
        ? db
            .prepare('SELECT * FROM clients WHERE name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ? ORDER BY name')
            .all(q, q, q, q, q)
        : db.prepare('SELECT * FROM clients ORDER BY name').all();
      const stats = db
        .prepare(
          `SELECT client_id, COUNT(*) AS job_count,
             SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN 1 ELSE 0 END) AS open_jobs,
             GROUP_CONCAT(DISTINCT division_id) AS division_ids
           FROM jobs GROUP BY client_id`,
        )
        .all() as { client_id: number; job_count: number; open_jobs: number; division_ids: string }[];
      const byClient = new Map(stats.map((s) => [s.client_id, s]));
      return rows.map((r) => {
        const s = byClient.get(r.id as number);
        return {
          ...mapClient(r),
          jobCount: s?.job_count ?? 0,
          openJobs: s?.open_jobs ?? 0,
          divisionIds: s?.division_ids ? s.division_ids.split(',').map(Number) : [],
        };
      });
    }),
  );

  api.post(
    '/clients',
    h((req) => {
      const b = req.body;
      const r = db
        .prepare('INSERT INTO clients (name, company, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(required(b, 'name'), b.company || null, b.email || null, b.phone || null, b.address || null, b.notes || null);
      return getClient(db, Number(r.lastInsertRowid));
    }),
  );

  api.get(
    '/clients/:id',
    h((req) => {
      const client = getClient(db, id(req));
      if (!client) throw new HttpError(404, 'Client not found');
      const jobs = db.prepare(`${JOB_SELECT} WHERE j.client_id = ? ORDER BY j.created_at DESC`).all(client.id).map(mapJob);
      return { ...client, jobs };
    }),
  );

  api.patch(
    '/clients/:id',
    h((req) => {
      patch(db, 'clients', id(req), req.body, {
        name: 'name',
        company: 'company',
        email: 'email',
        phone: 'phone',
        address: 'address',
        notes: 'notes',
      });
      return getClient(db, id(req));
    }),
  );

  api.delete(
    '/clients/:id',
    h((req) => {
      const count = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE client_id = ?').get(id(req)) as { n: number };
      if (count.n > 0) throw new HttpError(409, 'Client has jobs; archive or delete those first');
      db.prepare('DELETE FROM clients WHERE id = ?').run(id(req));
    }),
  );

  // ---------- Jobs ----------
  api.get(
    '/jobs',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      const q = req.query;
      if (q.divisionId) (where.push('j.division_id = ?'), params.push(Number(q.divisionId)));
      if (q.clientId) (where.push('j.client_id = ?'), params.push(Number(q.clientId)));
      if (q.assigneeId) (where.push('j.assignee_id = ?'), params.push(Number(q.assigneeId)));
      if (q.status) (where.push('j.status = ?'), params.push(String(q.status)));
      if (q.from) (where.push('j.scheduled_start >= ?'), params.push(String(q.from)));
      if (q.to) (where.push('j.scheduled_start < ?'), params.push(String(q.to)));
      if (q.q) {
        where.push('(j.title LIKE ? OR j.number LIKE ? OR j.address LIKE ? OR j.client_id IN (SELECT id FROM clients WHERE name LIKE ?))');
        const like = `%${q.q}%`;
        params.push(like, like, like, like);
      }
      const sql = `${JOB_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(j.scheduled_start, j.created_at) DESC`;
      return db.prepare(sql).all(...params).map(mapJob);
    }),
  );

  api.post(
    '/jobs',
    h((req) => {
      const b = req.body;
      const divisionId = Number(b.divisionId);
      const clientId = Number(b.clientId);
      if (!getClient(db, clientId)) throw new HttpError(400, 'Client not found');
      const status = assertOneOf(b.status ?? 'request', JOB_STATUSES, 'status');
      const job = tx(db, () => {
        const r = db
          .prepare(
            `INSERT INTO jobs (number, division_id, client_id, title, description, status, address, scheduled_start, scheduled_end, assignee_id, custom_fields)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            nextJobNumber(db, divisionId),
            divisionId,
            clientId,
            required(b, 'title'),
            b.description || null,
            status,
            b.address || getClient(db, clientId)!.address,
            b.scheduledStart || null,
            b.scheduledEnd || null,
            optNum(b.assigneeId),
            JSON.stringify(b.customFields ?? {}),
          );
        const jobId = Number(r.lastInsertRowid);
        for (const li of b.lineItems ?? []) {
          db.prepare('INSERT INTO line_items (job_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(
            jobId,
            li.description,
            Number(li.quantity) || 1,
            Number(li.unitPrice) || 0,
          );
        }
        const job = getJob(db, jobId)!;
        logActivity(db, 'job', `Created job ${job.number}: ${job.title}`, { jobId });
        const automations = runAutomations(db, { type: 'job_created', job });
        return { ...job, automations };
      });
      return job;
    }),
  );

  api.get(
    '/jobs/:id',
    h((req) => {
      const job = getJob(db, id(req));
      if (!job) throw new HttpError(404, 'Job not found');
      return {
        ...job,
        client: getClient(db, job.clientId),
        lineItems: db.prepare('SELECT * FROM line_items WHERE job_id = ? ORDER BY id').all(job.id).map(mapLineItem),
        tasks: db.prepare(`${TASK_SELECT} WHERE t.job_id = ? AND t.parent_id IS NULL ORDER BY t.created_at`).all(job.id).map(mapTask),
        activity: db
          .prepare('SELECT * FROM activity WHERE job_id = ? ORDER BY id DESC LIMIT 50')
          .all(job.id)
          .map((r) => ({ id: r.id, kind: r.kind, message: r.message, createdAt: r.created_at })),
      };
    }),
  );

  api.patch(
    '/jobs/:id',
    h((req) => {
      const before = getJob(db, id(req));
      if (!before) throw new HttpError(404, 'Job not found');
      const b = req.body;
      if ('status' in b) assertOneOf(b.status, JOB_STATUSES, 'status');
      return tx(db, () => {
        patch(
          db,
          'jobs',
          before.id,
          b,
          {
            title: 'title',
            description: 'description',
            status: 'status',
            address: 'address',
            scheduledStart: 'scheduled_start',
            scheduledEnd: 'scheduled_end',
            assigneeId: (v) => ['assignee_id', optNum(v)],
            clientId: (v) => ['client_id', Number(v)],
            customFields: (v) => ['custom_fields', JSON.stringify(v ?? {})],
          },
          true,
        );
        const after = getJob(db, before.id)!;
        let automations: string[] = [];
        if (after.status !== before.status) {
          logActivity(
            db,
            'job',
            `${after.number} moved from ${JOB_STATUS_META[before.status].label} to ${JOB_STATUS_META[after.status].label}`,
            { jobId: after.id },
          );
          automations = runAutomations(db, { type: 'job_status_changed', job: after, from: before.status, to: after.status });
        }
        return { ...getJob(db, before.id), automations };
      });
    }),
  );

  api.delete(
    '/jobs/:id',
    h((req) => {
      db.prepare('DELETE FROM jobs WHERE id = ?').run(id(req));
    }),
  );

  api.post(
    '/jobs/:id/line-items',
    h((req) => {
      const r = db
        .prepare('INSERT INTO line_items (job_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)')
        .run(id(req), required(req.body, 'description'), Number(req.body.quantity) || 1, Number(req.body.unitPrice) || 0);
      return mapLineItem(db.prepare('SELECT * FROM line_items WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/line-items/:id',
    h((req) => {
      patch(db, 'line_items', id(req), req.body, {
        description: 'description',
        quantity: (v) => ['quantity', Number(v) || 0],
        unitPrice: (v) => ['unit_price', Number(v) || 0],
      });
      return mapLineItem(db.prepare('SELECT * FROM line_items WHERE id = ?').get(id(req))!);
    }),
  );

  api.delete(
    '/line-items/:id',
    h((req) => {
      db.prepare('DELETE FROM line_items WHERE id = ?').run(id(req));
    }),
  );

  // ---------- Boards & groups ----------
  api.get(
    '/boards',
    h(() => db.prepare('SELECT * FROM boards ORDER BY name').all().map(mapBoard)),
  );

  api.post(
    '/boards',
    h((req) => {
      return tx(db, () => {
        const r = db
          .prepare('INSERT INTO boards (name, description, division_id) VALUES (?, ?, ?)')
          .run(required(req.body, 'name'), req.body.description || null, optNum(req.body.divisionId));
        const boardId = Number(r.lastInsertRowid);
        const groups: [string, string][] = req.body.groups ?? [
          ['To Do', '#579bfc'],
          ['In Progress', '#fdab3d'],
          ['Done', '#00c875'],
        ];
        groups.forEach(([name, color], i) =>
          db.prepare('INSERT INTO groups (board_id, name, color, position) VALUES (?, ?, ?, ?)').run(boardId, name, color, i),
        );
        return mapBoard(db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId)!);
      });
    }),
  );

  api.get(
    '/boards/:id',
    h((req) => {
      const row = db.prepare('SELECT * FROM boards WHERE id = ?').get(id(req));
      if (!row) throw new HttpError(404, 'Board not found');
      return {
        ...mapBoard(row),
        groups: db.prepare('SELECT * FROM groups WHERE board_id = ? ORDER BY position').all(row.id).map(mapGroup),
        tasks: db.prepare(`${TASK_SELECT} WHERE t.board_id = ? ORDER BY t.position, t.id`).all(row.id).map(mapTask),
      };
    }),
  );

  api.patch(
    '/boards/:id',
    h((req) => {
      patch(db, 'boards', id(req), req.body, {
        name: 'name',
        description: 'description',
        divisionId: (v) => ['division_id', optNum(v)],
      });
      return mapBoard(db.prepare('SELECT * FROM boards WHERE id = ?').get(id(req))!);
    }),
  );

  api.delete(
    '/boards/:id',
    h((req) => {
      db.prepare('DELETE FROM boards WHERE id = ?').run(id(req));
    }),
  );

  api.post(
    '/boards/:id/groups',
    h((req) => {
      const boardId = id(req);
      const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM groups WHERE board_id = ?').get(boardId) as { p: number };
      const r = db
        .prepare('INSERT INTO groups (board_id, name, color, position) VALUES (?, ?, ?, ?)')
        .run(boardId, required(req.body, 'name'), req.body.color ?? '#a25ddc', pos.p);
      return mapGroup(db.prepare('SELECT * FROM groups WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/groups/:id',
    h((req) => {
      patch(db, 'groups', id(req), req.body, { name: 'name', color: 'color', position: 'position' });
      return mapGroup(db.prepare('SELECT * FROM groups WHERE id = ?').get(id(req))!);
    }),
  );

  api.delete(
    '/groups/:id',
    h((req) => {
      const g = db.prepare('SELECT board_id FROM groups WHERE id = ?').get(id(req)) as { board_id: number } | undefined;
      if (!g) return;
      const n = db.prepare('SELECT COUNT(*) AS n FROM groups WHERE board_id = ?').get(g.board_id) as { n: number };
      if (n.n <= 1) throw new HttpError(409, 'A board needs at least one group');
      db.prepare('DELETE FROM groups WHERE id = ?').run(id(req));
    }),
  );

  // ---------- Tasks ----------
  api.get(
    '/tasks',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      const q = req.query;
      if (q.assigneeId) (where.push('t.assignee_id = ?'), params.push(Number(q.assigneeId)));
      if (q.jobId) (where.push('t.job_id = ?'), params.push(Number(q.jobId)));
      if (q.divisionId) (where.push('t.board_id IN (SELECT id FROM boards WHERE division_id = ?)'), params.push(Number(q.divisionId)));
      if (q.open === '1') where.push("t.status != 'done'");
      const sql = `${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.due_date IS NULL, t.due_date, t.id`;
      return db.prepare(sql).all(...params).map(mapTask);
    }),
  );

  api.post(
    '/tasks',
    h((req) => {
      const b = req.body;
      if (b.status) assertOneOf(b.status, TASK_STATUSES, 'status');
      if (b.priority) assertOneOf(b.priority, TASK_PRIORITIES, 'priority');
      const task = createTask(db, {
        boardId: Number(b.boardId),
        groupId: optNum(b.groupId),
        parentId: optNum(b.parentId),
        title: b.title,
        status: b.status,
        priority: b.priority,
        assigneeId: optNum(b.assigneeId),
        dueDate: b.dueDate || null,
        jobId: optNum(b.jobId),
      });
      logActivity(db, 'task', `Created task "${task.title}"`, { taskId: task.id, jobId: task.jobId });
      return task;
    }),
  );

  api.get(
    '/tasks/:id',
    h((req) => {
      const task = getTask(db, id(req));
      if (!task) throw new HttpError(404, 'Task not found');
      return {
        ...task,
        subtasks: db.prepare(`${TASK_SELECT} WHERE t.parent_id = ? ORDER BY t.position, t.id`).all(task.id).map(mapTask),
        updates: db.prepare('SELECT * FROM task_updates WHERE task_id = ? ORDER BY id DESC').all(task.id).map(mapTaskUpdate),
      };
    }),
  );

  api.patch(
    '/tasks/:id',
    h((req) => {
      const before = getTask(db, id(req));
      if (!before) throw new HttpError(404, 'Task not found');
      const b = req.body;
      if ('status' in b) assertOneOf(b.status, TASK_STATUSES, 'status');
      if ('priority' in b) assertOneOf(b.priority, TASK_PRIORITIES, 'priority');
      return tx(db, () => {
        let automations: string[] = [];
        if ('groupId' in b && Number(b.groupId) !== before.groupId) {
          const g = db.prepare('SELECT board_id FROM groups WHERE id = ?').get(Number(b.groupId)) as { board_id: number } | undefined;
          if (!g || g.board_id !== before.boardId) throw new HttpError(400, 'Group does not belong to this board');
          // Subtasks follow their parent between groups.
          db.prepare('UPDATE tasks SET group_id = ? WHERE parent_id = ?').run(Number(b.groupId), before.id);
        }
        patch(db, 'tasks', before.id, b, {
          title: 'title',
          status: 'status',
          priority: 'priority',
          dueDate: 'due_date',
          position: 'position',
          assigneeId: (v) => ['assignee_id', optNum(v)],
          jobId: (v) => ['job_id', optNum(v)],
          groupId: (v) => ['group_id', Number(v)],
        });
        if ('status' in b && b.status !== before.status) {
          db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run(b.status === 'done' ? new Date().toISOString() : null, before.id);
          const after = getTask(db, before.id)!;
          logActivity(
            db,
            'task',
            `"${after.title}" → ${TASK_STATUS_META[after.status as TaskStatus].label}`,
            { taskId: after.id, jobId: after.jobId },
          );
          automations = runAutomations(db, { type: 'task_status_changed', task: after, from: before.status, to: after.status });
        }
        return { ...getTask(db, before.id), automations };
      });
    }),
  );

  api.delete(
    '/tasks/:id',
    h((req) => {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id(req));
    }),
  );

  api.post(
    '/tasks/:id/updates',
    h((req) => {
      const r = db
        .prepare('INSERT INTO task_updates (task_id, author_id, body) VALUES (?, ?, ?)')
        .run(id(req), optNum(req.body.authorId), required(req.body, 'body'));
      return mapTaskUpdate(db.prepare('SELECT * FROM task_updates WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  // ---------- Automations ----------
  api.get(
    '/automations',
    h(() => db.prepare('SELECT * FROM automations ORDER BY id').all().map(mapAutomation)),
  );

  api.post(
    '/automations',
    h((req) => {
      const b = req.body;
      if (!b.trigger?.type || !b.action?.type) throw new HttpError(400, 'trigger and action are required');
      const r = db
        .prepare('INSERT INTO automations (name, enabled, trigger, action) VALUES (?, ?, ?, ?)')
        .run(required(b, 'name'), b.enabled === false ? 0 : 1, JSON.stringify(b.trigger), JSON.stringify(b.action));
      return mapAutomation(db.prepare('SELECT * FROM automations WHERE id = ?').get(r.lastInsertRowid)!);
    }),
  );

  api.patch(
    '/automations/:id',
    h((req) => {
      patch(db, 'automations', id(req), req.body, {
        name: 'name',
        enabled: (v) => ['enabled', v ? 1 : 0],
        trigger: (v) => ['trigger', JSON.stringify(v)],
        action: (v) => ['action', JSON.stringify(v)],
      });
      return mapAutomation(db.prepare('SELECT * FROM automations WHERE id = ?').get(id(req))!);
    }),
  );

  api.delete(
    '/automations/:id',
    h((req) => {
      db.prepare('DELETE FROM automations WHERE id = ?').run(id(req));
    }),
  );

  // ---------- Dashboard ----------
  api.get(
    '/dashboard',
    h((req): DashboardStats => {
      const divisionId = optNum(req.query.divisionId);
      const today = localDate();
      const monthStart = today.slice(0, 8) + '01';
      const divisions = db.prepare('SELECT id FROM divisions ORDER BY id').all() as { id: number }[];

      const perDivision = divisions
        .filter((d) => !divisionId || d.id === divisionId)
        .map((d) => {
          const one = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as { n: number }).n ?? 0;
          const total = `COALESCE((SELECT SUM(quantity * unit_price) FROM line_items li WHERE li.job_id = j.id), 0)`;
          return {
            divisionId: d.id,
            openJobs: one(`SELECT COUNT(*) AS n FROM jobs WHERE division_id = ? AND status NOT IN ('completed','invoiced','paid','cancelled')`, d.id),
            scheduledToday: one(`SELECT COUNT(*) AS n FROM jobs WHERE division_id = ? AND substr(scheduled_start, 1, 10) = ?`, d.id, today),
            revenueMonth: one(
              `SELECT SUM(${total}) AS n FROM jobs j WHERE division_id = ? AND status IN ('completed','invoiced','paid') AND updated_at >= ?`,
              d.id,
              monthStart,
            ),
            outstanding: one(`SELECT SUM(${total}) AS n FROM jobs j WHERE division_id = ? AND status = 'invoiced'`, d.id),
            openTasks: one(
              `SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND board_id IN (SELECT id FROM boards WHERE division_id = ?)`,
              d.id,
            ),
            overdueTasks: one(
              `SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND due_date < ? AND board_id IN (SELECT id FROM boards WHERE division_id = ?)`,
              today,
              d.id,
            ),
          };
        });

      const divFilter = divisionId ? 'AND j.division_id = ?' : '';
      const divParams = divisionId ? [divisionId] : [];
      const jobsByStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
      for (const r of db
        .prepare(`SELECT status, COUNT(*) AS n FROM jobs j WHERE 1=1 ${divFilter} GROUP BY status`)
        .all(...divParams) as { status: JobStatus; n: number }[]) {
        jobsByStatus[r.status] = r.n;
      }

      const upcomingJobs = db
        .prepare(`${JOB_SELECT} WHERE j.scheduled_start >= ? ${divFilter} AND j.status NOT IN ('cancelled') ORDER BY j.scheduled_start LIMIT 8`)
        .all(today, ...divParams)
        .map(mapJob);

      const taskDivFilter = divisionId ? 'AND t.board_id IN (SELECT id FROM boards WHERE division_id = ?)' : '';
      const overdueTasks = db
        .prepare(`${TASK_SELECT} WHERE t.status != 'done' AND t.due_date < ? ${taskDivFilter} ORDER BY t.due_date LIMIT 10`)
        .all(today, ...divParams)
        .map(mapTask);

      const recentActivity = db
        .prepare('SELECT * FROM activity ORDER BY id DESC LIMIT 15')
        .all()
        .map((r) => ({ id: r.id as number, kind: r.kind as string, message: r.message as string, jobId: r.job_id as number | null, taskId: r.task_id as number | null, createdAt: r.created_at as string }));

      return { divisions: perDivision, jobsByStatus, upcomingJobs, overdueTasks, recentActivity };
    }),
  );

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  });

  return api;
}

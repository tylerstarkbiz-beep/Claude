// Row mappers and shared queries used by the API and the automation engine.
import type { DB } from './db.ts';
import type {
  Automation,
  Board,
  Client,
  Division,
  Group,
  Job,
  LineItem,
  Task,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
  User,
} from '../shared/types.ts';

type Row = Record<string, any>;

export const mapDivision = (r: Row): Division => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  prefix: r.prefix,
  color: r.color,
  icon: r.icon,
  fields: JSON.parse(r.fields),
});

export const mapUser = (r: Row): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  color: r.color,
  divisionIds: JSON.parse(r.division_ids),
});

export const mapClient = (r: Row): Client => ({
  id: r.id,
  name: r.name,
  company: r.company,
  email: r.email,
  phone: r.phone,
  address: r.address,
  notes: r.notes,
  createdAt: r.created_at,
});

export const mapJob = (r: Row): Job => ({
  id: r.id,
  number: r.number,
  divisionId: r.division_id,
  clientId: r.client_id,
  title: r.title,
  description: r.description,
  status: r.status,
  address: r.address,
  scheduledStart: r.scheduled_start,
  scheduledEnd: r.scheduled_end,
  assigneeId: r.assignee_id,
  customFields: JSON.parse(r.custom_fields),
  total: r.total ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapLineItem = (r: Row): LineItem => ({
  id: r.id,
  jobId: r.job_id,
  description: r.description,
  quantity: r.quantity,
  unitPrice: r.unit_price,
});

export const mapBoard = (r: Row): Board => ({
  id: r.id,
  name: r.name,
  description: r.description,
  divisionId: r.division_id,
  createdAt: r.created_at,
});

export const mapGroup = (r: Row): Group => ({
  id: r.id,
  boardId: r.board_id,
  name: r.name,
  color: r.color,
  position: r.position,
});

export const mapTask = (r: Row): Task => ({
  id: r.id,
  boardId: r.board_id,
  groupId: r.group_id,
  parentId: r.parent_id,
  title: r.title,
  status: r.status,
  priority: r.priority,
  assigneeId: r.assignee_id,
  dueDate: r.due_date,
  jobId: r.job_id,
  position: r.position,
  createdAt: r.created_at,
  completedAt: r.completed_at,
  subtaskCount: r.subtask_count ?? 0,
  subtaskDoneCount: r.subtask_done_count ?? 0,
  updateCount: r.update_count ?? 0,
});

export const mapTaskUpdate = (r: Row): TaskUpdate => ({
  id: r.id,
  taskId: r.task_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
});

export const mapAutomation = (r: Row): Automation => ({
  id: r.id,
  name: r.name,
  enabled: !!r.enabled,
  trigger: JSON.parse(r.trigger),
  action: JSON.parse(r.action),
  runCount: r.run_count,
  createdAt: r.created_at,
});

/** SELECT for jobs including the computed total from line items. */
export const JOB_SELECT = `
  SELECT j.*, COALESCE((SELECT SUM(quantity * unit_price) FROM line_items li WHERE li.job_id = j.id), 0) AS total
  FROM jobs j`;

/** SELECT for tasks including subtask and update counts. */
export const TASK_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done') AS subtask_done_count,
    (SELECT COUNT(*) FROM task_updates u WHERE u.task_id = t.id) AS update_count
  FROM tasks t`;

export function getJob(db: DB, id: number): Job | undefined {
  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
  return row ? mapJob(row) : undefined;
}

export function getClient(db: DB, id: number): Client | undefined {
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  return row ? mapClient(row) : undefined;
}

export function getTask(db: DB, id: number): Task | undefined {
  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  return row ? mapTask(row) : undefined;
}

export function getDivision(db: DB, id: number): Division | undefined {
  const row = db.prepare('SELECT * FROM divisions WHERE id = ?').get(id);
  return row ? mapDivision(row) : undefined;
}

export function nextJobNumber(db: DB, divisionId: number): string {
  const division = getDivision(db, divisionId);
  if (!division) throw new HttpError(400, 'Unknown division');
  const row = db.prepare('SELECT COALESCE(MAX(id), 0) + 1001 AS n FROM jobs').get() as { n: number };
  return `${division.prefix}-${row.n}`;
}

export interface NewTask {
  boardId: number;
  groupId?: number | null;
  parentId?: number | null;
  title: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number | null;
  dueDate?: string | null;
  jobId?: number | null;
}

export function createTask(db: DB, input: NewTask): Task {
  if (!input.title?.trim()) throw new HttpError(400, 'Task title is required');
  let groupId = input.groupId ?? null;
  if (input.parentId) {
    const parent = getTask(db, input.parentId);
    if (!parent) throw new HttpError(400, 'Parent task not found');
    groupId = parent.groupId;
  }
  if (groupId == null) {
    const first = db
      .prepare('SELECT id FROM groups WHERE board_id = ? ORDER BY position LIMIT 1')
      .get(input.boardId) as { id: number } | undefined;
    if (!first) throw new HttpError(400, 'Board has no groups');
    groupId = first.id;
  } else {
    const group = db.prepare('SELECT board_id FROM groups WHERE id = ?').get(groupId) as
      | { board_id: number }
      | undefined;
    if (!group || group.board_id !== input.boardId) throw new HttpError(400, 'Group does not belong to board');
  }
  const pos = db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE group_id = ?')
    .get(groupId) as { p: number };
  const status = input.status ?? 'not_started';
  const result = db
    .prepare(
      `INSERT INTO tasks (board_id, group_id, parent_id, title, status, priority, assignee_id, due_date, job_id, position, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.boardId,
      groupId,
      input.parentId ?? null,
      input.title.trim(),
      status,
      input.priority ?? 'medium',
      input.assigneeId ?? null,
      input.dueDate ?? null,
      input.jobId ?? null,
      pos.p,
      status === 'done' ? localDateTime() : null,
    );
  return getTask(db, Number(result.lastInsertRowid))!;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the server's local time zone, offset by `days`. */
export function localDate(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * YYYY-MM-DDTHH:MM:SS in local time. Field timestamps (clock-ins, completions, schedules) are stored
 * this way so "which day did this happen" matches the crew's wall clock.
 */
export function localDateTime(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

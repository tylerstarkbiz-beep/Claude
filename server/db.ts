import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS divisions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'briefcase',
  fields TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'technician',
  color TEXT NOT NULL DEFAULT '#64748b',
  division_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  division_id INTEGER NOT NULL REFERENCES divisions(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'request',
  address TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  custom_fields TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS jobs_division ON jobs(division_id);
CREATE INDEX IF NOT EXISTS jobs_client ON jobs(client_id);

CREATE TABLE IF NOT EXISTS line_items (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#579bfc',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS tasks_board ON tasks(board_id);
CREATE INDEX IF NOT EXISTS tasks_job ON tasks(job_id);
CREATE INDEX IF NOT EXISTS tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS task_updates (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS time_user_start ON time_entries(user_id, started_at);
CREATE INDEX IF NOT EXISTS time_job ON time_entries(job_id);

CREATE TABLE IF NOT EXISTS job_notes (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_notes_job ON job_notes(job_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  note_id INTEGER REFERENCES job_notes(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  caption TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_job ON photos(job_id);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  notes TEXT,
  public_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  paid_on TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT,
  division_id INTEGER REFERENCES divisions(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  done_at TEXT,
  template_id INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date, template_id)
);
CREATE INDEX IF NOT EXISTS daily_items_user_date ON daily_items(user_id, date);

CREATE TABLE IF NOT EXISTS daily_reports (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  issues TEXT NOT NULL DEFAULT '',
  tomorrow TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction, rolling back on error. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function logActivity(
  db: DB,
  kind: string,
  message: string,
  refs: { jobId?: number | null; taskId?: number | null } = {},
) {
  db.prepare('INSERT INTO activity (kind, message, job_id, task_id) VALUES (?, ?, ?, ?)').run(
    kind,
    message,
    refs.jobId ?? null,
    refs.taskId ?? null,
  );
}

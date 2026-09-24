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
CREATE TABLE IF NOT EXISTS job_costs (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS job_costs_job ON job_costs(job_id);
-- Customer portal: single-use sign-in links and sessions. Only SHA-256 hashes of tokens are stored.
CREATE TABLE IF NOT EXISTS portal_tokens (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS portal_sessions (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every email the app sends (or would send, before an email service is connected).
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
-- The client's signature on an approved estimate, with what they agreed to at that moment.
CREATE TABLE IF NOT EXISTS estimate_signatures (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signature TEXT NOT NULL,
  total REAL NOT NULL,
  line_items TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  signed_at TEXT NOT NULL
);
`;

// Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS won't add them to an
// existing database, so they're applied here when missing.
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ['users', 'phone', 'TEXT'],
  ['users', 'hourly_rate', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'permissions', "TEXT NOT NULL DEFAULT '[]'"],
  ['users', 'active', 'INTEGER NOT NULL DEFAULT 1'],
  ['jobs', 'completed_at', 'TEXT'],
  // Rate in effect when the time was worked, so later raises don't rewrite past job costs.
  ['time_entries', 'hourly_rate', 'REAL'],
  ['jobs', 'source', "TEXT NOT NULL DEFAULT 'office'"],
  // When the client approved the estimate in the portal.
  ['jobs', 'approved_at', 'TEXT'],
  ['clients', 'portal_enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ['clients', 'portal_last_login', 'TEXT'],
  ['clients', 'stripe_customer_id', 'TEXT'],
  // Stripe PaymentIntent id, so a card payment is never recorded twice.
  ['payments', 'external_id', 'TEXT'],
  // Texting: email vs. text in the outbox, which job it's about, and what kind of message.
  ['outbox', 'channel', "TEXT NOT NULL DEFAULT 'email'"],
  ['outbox', 'job_id', 'INTEGER REFERENCES jobs(id) ON DELETE SET NULL'],
  ['outbox', 'kind', 'TEXT'],
  ['clients', 'sms_opt_out', 'INTEGER NOT NULL DEFAULT 0'],
  // When the job's time was last set, so a same-day booking doesn't also get a "reminder".
  ['jobs', 'booked_at', 'TEXT'],
  ['jobs', 'reminder_sent_at', 'TEXT'],
  ['jobs', 'quoted_at', 'TEXT'],
  ['jobs', 'followup_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['jobs', 'last_followup_on', 'TEXT'],
  // Deposit % for this job's estimate; null uses the company default.
  ['jobs', 'deposit_percent', 'REAL'],
  // 'deposit' invoices are collected when an estimate is approved and credited on the final invoice.
  ['invoices', 'kind', "TEXT NOT NULL DEFAULT 'standard'"],
];

function migrate(db: DB) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS payments_external_id ON payments(external_id)');
}

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
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

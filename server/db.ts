import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
-- Requests (a client or the office asks for a visit to inspect and quote) and quotes (estimates).
-- They stay on the client's account after conversion; jobs and invoices link back to them.
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  division_id INTEGER NOT NULL REFERENCES divisions(id),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  address TEXT,
  preferred_times TEXT,
  source TEXT NOT NULL DEFAULT 'office',
  status TEXT NOT NULL DEFAULT 'new',
  assessment_start TEXT,
  assessment_end TEXT,
  assessment_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_client ON requests(client_id);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  division_id INTEGER NOT NULL REFERENCES divisions(id),
  request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  deposit_percent REAL,
  sent_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  signer_name TEXT,
  signature TEXT,
  signed_ip TEXT,
  followup_count INTEGER NOT NULL DEFAULT 0,
  last_followup_on TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS quotes_request ON quotes(request_id);

CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS earnings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('commission', 'tip')),
  amount REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  earned_on TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  paid_out_at TEXT
);
CREATE INDEX IF NOT EXISTS earnings_user_month ON earnings(user_id, earned_on);
CREATE INDEX IF NOT EXISTS earnings_job ON earnings(job_id);
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
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_notes_job ON job_notes(job_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
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
  // Default commission % of the job total.
  ['users', 'commission_rate', 'REAL NOT NULL DEFAULT 0'],
  // Staff sign-in: pbkdf2$iterations$salt$hash; null = no login yet.
  ['users', 'password_hash', 'TEXT'],
  // General (non-job) time: Shop work, Travel, ...
  ['time_entries', 'category', 'TEXT'],
  // The chain: request → quote → job → invoice. Each step links back to the one before.
  ['jobs', 'request_id', 'INTEGER REFERENCES requests(id) ON DELETE SET NULL'],
  ['jobs', 'quote_id', 'INTEGER REFERENCES quotes(id) ON DELETE SET NULL'],
  ['invoices', 'quote_id', 'INTEGER REFERENCES quotes(id) ON DELETE SET NULL'],
  // Notes & photos can belong to a request, a quote or a job; some are shared with the client.
  ['job_notes', 'request_id', 'INTEGER REFERENCES requests(id) ON DELETE CASCADE'],
  ['job_notes', 'quote_id', 'INTEGER REFERENCES quotes(id) ON DELETE CASCADE'],
  ['job_notes', 'client_visible', 'INTEGER NOT NULL DEFAULT 0'],
  ['activity', 'request_id', 'INTEGER REFERENCES requests(id) ON DELETE CASCADE'],
  ['activity', 'quote_id', 'INTEGER REFERENCES quotes(id) ON DELETE CASCADE'],
];

/** Rebuild a table so `column` allows NULL (SQLite can't ALTER a NOT NULL away). Keeps data, indexes and references. */
function dropNotNull(db: DB, table: string, column: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
  if (!cols.find((c) => c.name === column)?.notnull) return;
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string };
  const indexes = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(table) as { sql: string }[]).map((r) => r.sql);
  const relaxed = sql.replace(new RegExp(`(\\b${column}\\s+INTEGER)\\s+NOT NULL`), '$1').replace(/CREATE TABLE (IF NOT EXISTS )?"?\w+"?/, `CREATE TABLE ${table}_rebuild`);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(relaxed);
    db.exec(`INSERT INTO ${table}_rebuild SELECT * FROM ${table}`);
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_rebuild RENAME TO ${table}`);
    for (const ix of indexes) db.exec(ix);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Jobs used to start life as status 'request' or 'quoted'. Those become real requests and quotes (with their
 * notes, photos, signature and deposit), and the placeholder job is removed. Runs once; a no-op afterwards.
 */
function moveLegacyStages(db: DB) {
  const legacy = db.prepare("SELECT * FROM jobs WHERE status IN ('request', 'quoted') ORDER BY id").all() as Record<string, any>[];
  if (!legacy.length) return;
  const next = (table: string, prefix: string) =>
    `${prefix}-${(db.prepare(`SELECT COALESCE(MAX(CAST(substr(number, ${prefix.length + 2}) AS INTEGER)), 1000) + 1 AS n FROM ${table}`).get() as { n: number }).n}`;
  tx(db, () => {
    for (const j of legacy) {
      const created = j.created_at;
      if (j.status === 'request') {
        const r = db
          .prepare('INSERT INTO requests (number, client_id, division_id, title, details, address, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(next('requests', 'REQ'), j.client_id, j.division_id, j.title, j.description ?? '', j.address, j.source ?? 'office', created);
        const requestId = Number(r.lastInsertRowid);
        db.prepare('UPDATE job_notes SET request_id = ?, job_id = NULL WHERE job_id = ?').run(requestId, j.id);
        db.prepare('UPDATE activity SET request_id = ?, job_id = NULL WHERE job_id = ?').run(requestId, j.id);
      } else {
        const sig = db.prepare('SELECT * FROM estimate_signatures WHERE job_id = ? ORDER BY id DESC').get(j.id) as Record<string, any> | undefined;
        const r = db
          .prepare(
            `INSERT INTO quotes (number, client_id, division_id, title, description, address, status, deposit_percent, sent_at, approved_at, approved_by, signer_name, signature,
               signed_ip, followup_count, last_followup_on, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            next('quotes', 'Q'),
            j.client_id,
            j.division_id,
            j.title,
            j.description ?? '',
            j.address,
            j.approved_at ? 'approved' : 'sent',
            j.deposit_percent,
            j.quoted_at ?? created,
            j.approved_at,
            j.approved_at ? 'client' : null,
            sig?.signer_name ?? null,
            sig?.signature ?? null,
            sig?.ip ?? null,
            j.followup_count ?? 0,
            j.last_followup_on,
            created,
          );
        const quoteId = Number(r.lastInsertRowid);
        db.prepare('INSERT INTO quote_items (quote_id, description, quantity, unit_price) SELECT ?, description, quantity, unit_price FROM line_items WHERE job_id = ?').run(
          quoteId,
          j.id,
        );
        db.prepare('UPDATE job_notes SET quote_id = ?, job_id = NULL WHERE job_id = ?').run(quoteId, j.id);
        db.prepare('UPDATE activity SET quote_id = ?, job_id = NULL WHERE job_id = ?').run(quoteId, j.id);
        db.prepare('UPDATE invoices SET quote_id = ? WHERE job_id = ?').run(quoteId, j.id);
      }
      db.prepare('UPDATE photos SET job_id = NULL WHERE job_id = ?').run(j.id);
      db.prepare('DELETE FROM jobs WHERE id = ?').run(j.id);
    }
  });
}

function migrate(db: DB) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS payments_external_id ON payments(external_id)');
  dropNotNull(db, 'job_notes', 'job_id');
  dropNotNull(db, 'photos', 'job_id');
  moveLegacyStages(db);
}

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const hadUsers = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'users'").get();
  const hadEarnings = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'earnings'").get();
  db.exec(SCHEMA);
  migrate(db);
  // Existing databases: owners get the new commissions & tips permission once, when the feature arrives.
  if (hadUsers && !hadEarnings) {
    db.exec(`UPDATE users SET permissions = json_insert(permissions, '$[#]', 'manage_pay')
             WHERE role = 'owner' AND NOT EXISTS (SELECT 1 FROM json_each(users.permissions) WHERE value = 'manage_pay')`);
  }
  return db;
}

/** Run fn inside a transaction, rolling back on error. Nested calls join the outer transaction. */
const inTx = new WeakSet<DB>();
export function tx<T>(db: DB, fn: () => T): T {
  if (inTx.has(db)) return fn();
  db.exec('BEGIN');
  inTx.add(db);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    inTx.delete(db);
  }
}

export function logActivity(
  db: DB,
  kind: string,
  message: string,
  refs: { jobId?: number | null; taskId?: number | null; requestId?: number | null; quoteId?: number | null } = {},
) {
  db.prepare('INSERT INTO activity (kind, message, job_id, task_id, request_id, quote_id) VALUES (?, ?, ?, ?, ?, ?)').run(
    kind,
    message,
    refs.jobId ?? null,
    refs.taskId ?? null,
    refs.requestId ?? null,
    refs.quoteId ?? null,
  );
}

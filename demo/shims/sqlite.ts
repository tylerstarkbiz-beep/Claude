// node:sqlite's DatabaseSync API on top of sql.js, so the server code runs unchanged in the browser.
import type { Database, SqlValue } from 'sql.js';

let SQL: { Database: new () => Database } | null = null;
export function provideSqlJs(mod: typeof SQL) {
  SQL = mod;
}

const value = (p: unknown): SqlValue => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : (p as SqlValue));

/** Positional args, or node:sqlite-style named params ({ now: … } for `:now`). */
function norm(params: unknown[]): SqlValue[] | Record<string, SqlValue> {
  const [first] = params;
  if (params.length === 1 && first && typeof first === 'object' && !Array.isArray(first) && !(first instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(first).map(([k, v]) => [/^[:@$]/.test(k) ? k : `:${k}`, value(v)]));
  }
  return params.map(value);
}

/** Match node:sqlite, which throws on named parameters the statement doesn't use. */
function checkNamed(sql: string, params: unknown[]) {
  const [first] = params;
  if (params.length !== 1 || !first || typeof first !== 'object' || Array.isArray(first)) return;
  for (const k of Object.keys(first)) if (!sql.includes(`:${k.replace(/^[:@$]/, '')}`)) throw new TypeError(`Unknown named parameter '${k}'`);
}

export class DatabaseSync {
  private db: Database;
  constructor(_path: string) {
    if (!SQL) throw new Error('sql.js not loaded');
    this.db = new SQL.Database();
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  prepare(sql: string) {
    const db = this.db;
    const rows = (params: unknown[], limit = Infinity) => {
      checkNamed(sql, params);
      const stmt = db.prepare(sql);
      try {
        stmt.bind(norm(params));
        const out: Record<string, any>[] = [];
        while (out.length < limit && stmt.step()) out.push(stmt.getAsObject());
        return out;
      } finally {
        stmt.free();
      }
    };
    return {
      get: (...params: unknown[]) => rows(params, 1)[0],
      all: (...params: unknown[]) => rows(params),
      run: (...params: unknown[]) => {
        checkNamed(sql, params);
        db.run(sql, norm(params));
        const changes = db.getRowsModified();
        const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
        return { changes, lastInsertRowid };
      },
    };
  }
}

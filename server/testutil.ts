import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { seed } from './seed.ts';
import { createApp } from './index.ts';

/** Start the app on a random port against a fresh seeded in-memory database. */
export async function setup() {
  const db = openDb(':memory:');
  seed(db);
  const uploadDir = mkdtempSync(join(tmpdir(), 'fieldboard-test-'));
  const server = createApp(db, { uploadDir }).listen(0);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(origin + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  const userId = (name: string) => (db.prepare('SELECT id FROM users WHERE name = ?').get(name) as { id: number }).id;
  const jobId = (title: string) => (db.prepare('SELECT id FROM jobs WHERE title = ?').get(title) as { id: number }).id;
  return { db, call, origin, uploadDir, userId, jobId, close: () => server.close() };
}

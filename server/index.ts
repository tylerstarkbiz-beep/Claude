import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb, type DB } from './db.ts';
import { createApi } from './api.ts';
import { seedIfEmpty } from './seed.ts';

export function createApp(db: DB) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApi(db));

  // In production, serve the built web client from the same origin.
  const dist = resolve(import.meta.dirname, '../dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const db = openDb(process.env.DB_PATH ?? resolve(import.meta.dirname, '../data/fieldboard.db'));
  seedIfEmpty(db);
  const port = Number(process.env.PORT ?? 3001);
  createApp(db).listen(port, () => console.log(`FieldBoard API listening on http://localhost:${port}`));
}

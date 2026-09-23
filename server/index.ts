import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb, type DB } from './db.ts';
import { createApi } from './api.ts';
import { createInvoicesApi } from './invoices.ts';
import { createNotesApi } from './notes.ts';
import { createTimeApi } from './time.ts';
import { createTeamApi } from './team.ts';
import { createCostingApi } from './costing.ts';
import { HttpError } from './repo.ts';
import { seedIfEmpty } from './seed.ts';

const ROOT = resolve(import.meta.dirname, '..');

export function createApp(db: DB, opts: { uploadDir?: string } = {}) {
  const uploadDir = opts.uploadDir ?? process.env.UPLOAD_DIR ?? resolve(ROOT, 'data/uploads');
  const app = express();
  // Notes can carry several phone photos (resized client-side), so allow larger bodies.
  app.use(express.json({ limit: '40mb' }));
  app.use('/api', createNotesApi(db, uploadDir), createTimeApi(db), createInvoicesApi(db), createTeamApi(db), createCostingApi(db), createApi(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Upload too large' });
    }
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  });
  app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

  // In production, serve the built web client from the same origin.
  const dist = resolve(ROOT, 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const db = openDb(process.env.DB_PATH ?? resolve(ROOT, 'data/fieldboard.db'));
  seedIfEmpty(db);
  const port = Number(process.env.PORT ?? 3001);
  createApp(db).listen(port, () => console.log(`FieldBoard listening on http://localhost:${port}`));
}

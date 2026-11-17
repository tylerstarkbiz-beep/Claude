// Notes with photo attachments, on any step of the chain: a request, a quote or a job.
// Photos are stored as files in the upload directory. Loading notes "for the chain" gathers every step's notes,
// so a job (and its invoice) shows what was written and photographed back at the request and quote.
import { Router, type Request } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logActivity, tx, type DB } from './db.ts';
import { h, id } from './http.ts';
import { HttpError, getJob, localDateTime } from './repo.ts';
import { chainFor, getQuote, getRequest } from './pipeline.ts';
import { staffUser } from './auth.ts';
import type { Chain, JobNote, Photo, Stage } from '../shared/types.ts';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,(.+)$/;

const mapPhoto = (r: Record<string, any>): Photo => ({
  id: r.id,
  jobId: r.job_id,
  noteId: r.note_id,
  authorId: r.author_id,
  url: `/uploads/${r.filename}`,
  caption: r.caption,
  createdAt: r.created_at,
});

export type NoteWithJob = JobNote & { job: { id: number; number: string; title: string } | null };

/** Load notes (newest first) matching a WHERE clause on job_notes `n`, with their photos attached. */
export function loadNotes(db: DB, where: string, params: any[]): NoteWithJob[] {
  const rows = db
    .prepare(
      `SELECT n.*, j.number AS job_number, j.title AS job_title, q.number AS quote_number, r.number AS request_number
       FROM job_notes n
       LEFT JOIN jobs j ON j.id = n.job_id
       LEFT JOIN quotes q ON q.id = n.quote_id
       LEFT JOIN requests r ON r.id = n.request_id
       WHERE ${where} ORDER BY n.created_at DESC, n.id DESC`,
    )
    .all(...params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as number);
  const photos = db
    .prepare(`SELECT * FROM photos WHERE note_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
    .all(...ids)
    .map(mapPhoto);
  return rows.map((r) => {
    const stage: Stage = r.job_id ? 'job' : r.quote_id ? 'quote' : 'request';
    return {
      id: r.id as number,
      jobId: (r.job_id as number) ?? null,
      requestId: (r.request_id as number) ?? null,
      quoteId: (r.quote_id as number) ?? null,
      stage,
      stageNumber: (r.job_number ?? r.quote_number ?? r.request_number ?? '') as string,
      authorId: r.author_id as number | null,
      fromClient: r.author_id == null,
      clientVisible: r.author_id == null || !!r.client_visible,
      body: r.body as string,
      createdAt: r.created_at as string,
      photos: photos.filter((p) => p.noteId === r.id),
      job: r.job_id ? { id: r.job_id as number, number: r.job_number as string, title: r.job_title as string } : null,
    };
  });
}

/** Every note on every step of a chain (request, quote and job). */
export function chainNotes(db: DB, chain: Chain, onlyClientVisible = false): NoteWithJob[] {
  const notes = loadNotes(db, 'n.job_id = ? OR n.quote_id = ? OR n.request_id = ?', [chain.job?.id ?? -1, chain.quote?.id ?? -1, chain.request?.id ?? -1]);
  return onlyClientVisible ? notes.filter((n) => n.clientVisible) : notes;
}

export type NoteTarget = { stage: Stage; id: number };

/** Add a note (and photos) to a request, quote or job. authorId null means the client wrote it in the portal. */
export function addNote(
  db: DB,
  uploadDir: string,
  target: NoteTarget,
  input: { body?: unknown; photos?: unknown; clientVisible?: unknown; authorId: number | null },
): NoteWithJob {
  const label =
    target.stage === 'job'
      ? (
          getJob(db, target.id) ??
          (() => {
            throw new HttpError(404, 'Job not found');
          })()
        ).number
      : target.stage === 'quote'
        ? getQuote(db, target.id).number
        : getRequest(db, target.id).number;
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 8000) : '';
  const photos: { dataUrl: string; caption?: string }[] = Array.isArray(input.photos) ? input.photos.slice(0, 20) : [];
  if (!body && !photos.length) throw new HttpError(400, 'Add some text or a photo');

  // Write files first so a bad image fails before anything is saved.
  const files = photos.map((p) => ({ filename: savePhoto(uploadDir, `${target.stage}${target.id}`, p.dataUrl), caption: p.caption || null }));
  try {
    return tx(db, () => {
      const now = localDateTime();
      const col = target.stage === 'job' ? 'job_id' : target.stage === 'quote' ? 'quote_id' : 'request_id';
      const r = db
        .prepare(`INSERT INTO job_notes (${col}, author_id, body, client_visible, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(target.id, input.authorId, body, input.authorId == null || input.clientVisible ? 1 : 0, now);
      const noteId = Number(r.lastInsertRowid);
      for (const f of files) {
        db.prepare('INSERT INTO photos (job_id, note_id, author_id, filename, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          target.stage === 'job' ? target.id : null,
          noteId,
          input.authorId,
          f.filename,
          f.caption,
          now,
        );
      }
      const what = [body && 'a note', files.length && `${files.length} photo${files.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
      logActivity(db, 'note', `${input.authorId == null ? 'The client added' : 'Added'} ${what} to ${label}`, {
        jobId: target.stage === 'job' ? target.id : null,
        quoteId: target.stage === 'quote' ? target.id : null,
        requestId: target.stage === 'request' ? target.id : null,
      });
      return loadNotes(db, 'n.id = ?', [noteId])[0];
    });
  } catch (err) {
    for (const f of files) rmSync(join(uploadDir, f.filename), { force: true });
    throw err;
  }
}

function savePhoto(uploadDir: string, prefix: string, dataUrl: unknown): string {
  const m = typeof dataUrl === 'string' ? DATA_URL.exec(dataUrl) : null;
  if (!m) throw new HttpError(400, 'Photos must be JPEG, PNG or WebP images');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photo is larger than 10 MB');
  const filename = `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  writeFileSync(join(uploadDir, filename), bytes);
  return filename;
}

const STAGES: { path: string; stage: Stage }[] = [
  { path: 'jobs', stage: 'job' },
  { path: 'quotes', stage: 'quote' },
  { path: 'requests', stage: 'request' },
];

export function createNotesApi(db: DB, uploadDir: string): Router {
  const api = Router();
  mkdirSync(uploadDir, { recursive: true });

  function removeFiles(where: string, param: number) {
    for (const r of db.prepare(`SELECT filename FROM photos WHERE ${where}`).all(param)) {
      rmSync(join(uploadDir, r.filename as string), { force: true });
    }
  }

  // Runs before the main router's DELETE /jobs/:id, which removes the rows.
  api.delete('/jobs/:id', (req, _res, next) => {
    const jobId = Number(req.params.id);
    if (Number.isInteger(jobId)) removeFiles('job_id = ?', jobId);
    next();
  });

  for (const { path, stage } of STAGES) {
    // ?chain=1 returns the notes from every step of the chain this record belongs to.
    api.get(
      `/${path}/:id/notes`,
      h((req: Request) => {
        if (req.query.chain === '1') return chainNotes(db, chainFor(db, stage, id(req)));
        const col = stage === 'job' ? 'job_id' : stage === 'quote' ? 'quote_id' : 'request_id';
        return loadNotes(db, `n.${col} = ?`, [id(req)]);
      }),
    );

    api.post(
      `/${path}/:id/notes`,
      h((req: Request) =>
        addNote(
          db,
          uploadDir,
          { stage, id: id(req) },
          { body: req.body.body, photos: req.body.photos, clientVisible: req.body.clientVisible, authorId: staffUser(req)?.id ?? null },
        ),
      ),
    );
  }

  api.patch(
    '/notes/:id',
    h((req) => {
      const sets: string[] = [];
      const vals: any[] = [];
      if ('body' in req.body) (sets.push('body = ?'), vals.push(String(req.body.body ?? '')));
      if ('clientVisible' in req.body) (sets.push('client_visible = ?'), vals.push(req.body.clientVisible ? 1 : 0));
      if (sets.length) db.prepare(`UPDATE job_notes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id(req));
      return loadNotes(db, 'n.id = ?', [id(req)])[0];
    }),
  );

  api.delete(
    '/notes/:id',
    h((req) => {
      removeFiles('note_id = ?', id(req));
      db.prepare('DELETE FROM job_notes WHERE id = ?').run(id(req));
    }),
  );

  api.delete(
    '/photos/:id',
    h((req) => {
      removeFiles('id = ?', id(req));
      db.prepare('DELETE FROM photos WHERE id = ?').run(id(req));
    }),
  );

  return api;
}

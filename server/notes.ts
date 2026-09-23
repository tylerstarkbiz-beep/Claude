// Job notes with photo attachments. Photos are stored as files in the upload directory.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logActivity, tx, type DB } from './db.ts';
import { h, id, optNum } from './http.ts';
import { HttpError, getJob, localDateTime } from './repo.ts';
import type { JobNote, Photo } from '../shared/types.ts';

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

/** Load notes (newest first) matching a WHERE clause on job_notes `n`, with their photos attached. */
export function loadNotes(db: DB, where: string, params: any[]): (JobNote & { job: { id: number; number: string; title: string } })[] {
  const rows = db
    .prepare(
      `SELECT n.*, j.number AS job_number, j.title AS job_title FROM job_notes n JOIN jobs j ON j.id = n.job_id
       WHERE ${where} ORDER BY n.created_at DESC, n.id DESC`,
    )
    .all(...params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as number);
  const photos = db
    .prepare(`SELECT * FROM photos WHERE note_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
    .all(...ids)
    .map(mapPhoto);
  return rows.map((r) => ({
    id: r.id as number,
    jobId: r.job_id as number,
    authorId: r.author_id as number | null,
    body: r.body as string,
    createdAt: r.created_at as string,
    photos: photos.filter((p) => p.noteId === r.id),
    job: { id: r.job_id as number, number: r.job_number as string, title: r.job_title as string },
  }));
}

export function createNotesApi(db: DB, uploadDir: string): Router {
  const api = Router();
  mkdirSync(uploadDir, { recursive: true });

  function savePhoto(jobId: number, dataUrl: unknown): string {
    const m = typeof dataUrl === 'string' ? DATA_URL.exec(dataUrl) : null;
    if (!m) throw new HttpError(400, 'Photos must be JPEG, PNG or WebP images');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photo is larger than 10 MB');
    const filename = `job${jobId}-${Date.now()}-${randomBytes(4).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    writeFileSync(join(uploadDir, filename), bytes);
    return filename;
  }

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

  api.get(
    '/jobs/:id/notes',
    h((req) => loadNotes(db, 'n.job_id = ?', [id(req)])),
  );

  // Create a note with any number of photos in one request (what the tech app sends).
  api.post(
    '/jobs/:id/notes',
    h((req) => {
      const job = getJob(db, id(req));
      if (!job) throw new HttpError(404, 'Job not found');
      const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
      const photos: { dataUrl: string; caption?: string }[] = Array.isArray(req.body.photos) ? req.body.photos : [];
      if (!body && !photos.length) throw new HttpError(400, 'Add some text or a photo');

      // Write files first so a bad image fails before anything is saved.
      const files = photos.map((p) => ({ filename: savePhoto(job.id, p.dataUrl), caption: p.caption || null }));
      try {
        return tx(db, () => {
          const now = localDateTime();
          const authorId = optNum(req.body.authorId);
          const r = db.prepare('INSERT INTO job_notes (job_id, author_id, body, created_at) VALUES (?, ?, ?, ?)').run(job.id, authorId, body, now);
          const noteId = Number(r.lastInsertRowid);
          for (const f of files) {
            db.prepare('INSERT INTO photos (job_id, note_id, author_id, filename, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
              job.id,
              noteId,
              authorId,
              f.filename,
              f.caption,
              now,
            );
          }
          const what = [body && 'a note', files.length && `${files.length} photo${files.length > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
          logActivity(db, 'note', `Added ${what} to ${job.number}`, { jobId: job.id });
          return loadNotes(db, 'n.id = ?', [noteId])[0];
        });
      } catch (err) {
        for (const f of files) rmSync(join(uploadDir, f.filename), { force: true });
        throw err;
      }
    }),
  );

  api.patch(
    '/notes/:id',
    h((req) => {
      db.prepare('UPDATE job_notes SET body = ? WHERE id = ?').run(String(req.body.body ?? ''), id(req));
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

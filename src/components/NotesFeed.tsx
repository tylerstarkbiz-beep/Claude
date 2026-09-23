import { useRef, useState } from 'react';
import { Camera, Loader2, Send, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { del, post, useApi } from '../api';
import { useApp } from '../store';
import { resizeImage } from '../photos';
import { relative } from '../format';
import { Avatar, Button } from './ui';
import type { JobNote, Photo } from '../../shared/types';

/** Job notes with photos: a composer (camera/gallery on phones) and the note history. */
export function NotesFeed({ jobId, large }: { jobId: number; large?: boolean }) {
  const app = useApp();
  const { data: notes, reload } = useApi<JobNote[]>(`/jobs/${jobId}/notes`);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const resized = await Promise.all([...files].map((f) => resizeImage(f)));
      setPhotos((p) => [...p, ...resized]);
    } catch {
      app.toast('Could not read that image', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit() {
    if (!body.trim() && !photos.length) return;
    setBusy(true);
    try {
      await post(`/jobs/${jobId}/notes`, { body, authorId: app.currentUserId, photos: photos.map((dataUrl) => ({ dataUrl })) });
      setBody('');
      setPhotos([]);
      reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const allPhotos = notes?.flatMap((n) => n.photos) ?? [];

  return (
    <div>
      <div className="rounded-lg border border-slate-200 p-3">
        <textarea
          className="w-full resize-none text-sm outline-none"
          rows={large ? 3 : 2}
          placeholder="Add a note — what you found, what you did, what's next…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {photos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} className="h-16 w-16 rounded object-cover" />
                <button
                  onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-0.5 text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className={clsx(large && 'py-3')}>
            <Camera size={large ? 20 : 16} /> Photos
          </Button>
          <Button onClick={submit} disabled={busy || (!body.trim() && !photos.length)} className={clsx(large && 'py-3')}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Save note
          </Button>
        </div>
      </div>

      {allPhotos.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-slate-500">Photos ({allPhotos.length})</div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {allPhotos.map((p) => (
              <button key={p.id} onClick={() => setViewing(p)} className="aspect-square overflow-hidden rounded-md bg-slate-100">
                <img src={p.url} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {notes?.map((n) => {
          const author = app.user(n.authorId);
          return (
            <div key={n.id} className="group rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                <Avatar user={author} size={20} />
                <span className="font-medium text-slate-700">{author?.name ?? 'Someone'}</span>
                <span>· {relative(n.createdAt)}</span>
                <button
                  className="ml-auto text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                  onClick={async () => confirm('Delete this note and its photos?') && (await del(`/notes/${n.id}`), reload())}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {n.body && <p className="whitespace-pre-wrap text-sm">{n.body}</p>}
              {n.photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.photos.map((p) => (
                    <button key={p.id} onClick={() => setViewing(p)}>
                      <img src={p.url} loading="lazy" className="h-20 w-20 rounded object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {notes && !notes.length && <p className="text-sm text-slate-400">No notes yet.</p>}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setViewing(null)}>
          <img src={viewing.url} className="max-h-full max-w-full rounded" />
          <button className="absolute right-4 top-4 text-white">
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
}

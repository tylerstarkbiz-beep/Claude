import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Loader2, Send, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { resizeImage } from '../photos';
import { relative } from '../format';
import { Avatar, Button } from './ui';
import type { JobNote, Photo, Stage } from '../../shared/types';

const PATH: Record<Stage, string> = { request: 'requests', quote: 'quotes', job: 'jobs' };
const STAGE_LABEL: Record<Stage, string> = { request: 'Request', quote: 'Quote', job: 'Job' };

/**
 * Notes with photos on a request, quote or job: a composer (camera/gallery on phones) and the history.
 * With `chain`, the history includes every step of the request → quote → job chain, each labeled.
 */
export function NotesFeed({
  stage = 'job',
  id,
  jobId,
  large,
  chain,
  readOnly,
}: {
  stage?: Stage;
  id?: number;
  jobId?: number;
  large?: boolean;
  chain?: boolean;
  readOnly?: boolean;
}) {
  const app = useApp();
  const targetId = (id ?? jobId)!;
  const base = `/${PATH[stage]}/${targetId}/notes`;
  const { data: notes, reload } = useApi<JobNote[]>(chain ? `${base}?chain=1` : base);
  const [share, setShare] = useState(false);
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
      await post(base, { body, clientVisible: share, photos: photos.map((dataUrl) => ({ dataUrl })) });
      setBody('');
      setShare(false);
      setPhotos([]);
      reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const allPhotos = notes?.flatMap((n) => n.photos) ?? [];

  async function toggleShare(n: JobNote) {
    try {
      await patch(`/notes/${n.id}`, { clientVisible: !n.clientVisible });
      reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <div>
      {!readOnly && (
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className={clsx(large && 'py-3')}>
              <Camera size={large ? 20 : 16} /> Photos
            </Button>
            <label className="mr-auto flex items-center gap-1.5 text-xs text-slate-600" title="Customers see shared notes and photos in their portal">
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with customer
            </label>
            <Button onClick={submit} disabled={busy || (!body.trim() && !photos.length)} className={clsx(large && 'py-3')}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Save note
            </Button>
          </div>
        </div>
      )}

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
          const elsewhere = chain && !(n.stage === stage && (n.jobId ?? n.quoteId ?? n.requestId) === targetId);
          return (
            <div key={n.id} className={clsx('group rounded-lg border p-3', n.fromClient ? 'border-sky-200 bg-sky-50/50' : 'border-slate-200')}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {n.fromClient ? (
                  <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800">Customer</span>
                ) : (
                  <>
                    <Avatar user={author} size={20} />
                    <span className="font-medium text-slate-700">{author?.name ?? 'Someone'}</span>
                  </>
                )}
                <span>· {relative(n.createdAt)}</span>
                {chain && (
                  <span className={clsx('rounded px-1.5 py-0.5 font-medium', elsewhere ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-700')}>
                    {STAGE_LABEL[n.stage]} {n.stageNumber}
                  </span>
                )}
                {!n.fromClient && (
                  <button
                    onClick={() => !readOnly && toggleShare(n)}
                    className={clsx('flex items-center gap-1', n.clientVisible ? 'text-emerald-700' : 'text-slate-400', !readOnly && 'hover:text-slate-700')}
                    title={n.clientVisible ? 'Shared with the customer (click to make internal)' : 'Internal only (click to share with the customer)'}
                  >
                    {n.clientVisible ? <Eye size={13} /> : <EyeOff size={13} />} {n.clientVisible ? 'Shared' : 'Internal'}
                  </button>
                )}
                {!readOnly && (
                  <button
                    className="ml-auto text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                    onClick={async () => confirm('Delete this note and its photos?') && (await del(`/notes/${n.id}`), reload())}
                    aria-label="Delete note"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
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

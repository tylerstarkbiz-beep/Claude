import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Check, CheckCircle2, MapPin, Navigation, Phone, Play, Square } from 'lucide-react';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { money, time } from '../format';
import { Pill } from '../components/ui';
import { NotesFeed } from '../components/NotesFeed';
import { useClock } from './ClockCard';
import { JOB_STATUS_META, type Job, type JobDetail, type Task } from '../../shared/types';

/** A job from the tech's point of view: contact, timer, status, checklist tasks, notes & photos. */
export function TechJob() {
  const { id } = useParams();
  const app = useApp();
  const clock = useClock();
  const { data: job, reload } = useApi<JobDetail>(`/jobs/${id}`);
  if (!job) return <div className="text-slate-400">Loading…</div>;

  const div = app.division(job.divisionId);
  const timing = clock.status?.entry?.jobId === job.id;
  const maps = job.address ? `https://maps.google.com/?q=${encodeURIComponent(job.address)}` : null;

  async function setStatus(status: Job['status']) {
    const res = await patch<Job & { automations?: string[] }>(`/jobs/${job!.id}`, { status });
    app.announce(res);
    reload();
  }
  async function toggleTask(t: Task) {
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${t.id}`, { status: t.status === 'done' ? 'not_started' : 'done' });
    app.announce(res);
    reload();
  }

  const filled = div?.fields.filter((f) => job.customFields[f.key]) ?? [];

  return (
    <div className="space-y-4">
      <Link to="/tech" className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft size={16} /> Today
      </Link>

      <section className="card border-t-4 p-4" style={{ borderTopColor: div?.color }}>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-mono">{job.number}</span>
          <Pill label={JOB_STATUS_META[job.status].label} color={JOB_STATUS_META[job.status].color} />
        </div>
        <h1 className="mt-1 text-xl font-bold leading-snug">{job.title}</h1>
        {job.scheduledStart && (
          <div className="text-sm text-slate-500">
            {new Date(job.scheduledStart).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, {time(job.scheduledStart)}
            {job.scheduledEnd && ` – ${time(job.scheduledEnd)}`}
          </div>
        )}
        <div className="mt-3 font-medium">{job.client.name}</div>
        {job.address && (
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <MapPin size={14} /> {job.address}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {job.client.phone && (
            <a href={`tel:${job.client.phone}`} className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-3 font-medium">
              <Phone size={18} /> Call
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-3 font-medium">
              <Navigation size={18} /> Directions
            </a>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {timing ? (
          <button onClick={() => clock.clockIn(null)} disabled={clock.busy} className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-4 font-semibold text-white">
            <Square size={18} /> Stop job timer
          </button>
        ) : (
          <button onClick={() => clock.clockIn(job.id)} disabled={clock.busy} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 font-semibold text-white">
            <Play size={18} /> Start job timer
          </button>
        )}
        {['completed', 'invoiced', 'paid'].includes(job.status) ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-4 font-semibold text-emerald-700">
            <CheckCircle2 size={18} /> Completed
          </div>
        ) : (
          <button
            onClick={() => confirm('Mark this job complete?') && setStatus('completed')}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-4 font-semibold text-white"
          >
            <CheckCircle2 size={18} /> Complete job
          </button>
        )}
      </section>

      {(job.description || filled.length > 0) && (
        <section className="card p-4 text-sm">
          {job.description && <p className="mb-3 whitespace-pre-wrap">{job.description}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {filled.map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-slate-500">{f.label}</dt>
                <dd className="font-medium">{job.customFields[f.key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {job.tasks.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Job tasks</h2>
          {job.tasks.map((t) => (
            <button key={t.id} onClick={() => toggleTask(t)} className="flex w-full items-center gap-3 text-left">
              <span
                className={clsx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-md border-2',
                  t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300',
                )}
              >
                {t.status === 'done' && <Check size={16} strokeWidth={3} />}
              </span>
              <span className={clsx('flex-1 py-3', t.status === 'done' && 'text-slate-400 line-through')}>{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Notes & photos</h2>
        <NotesFeed jobId={job.id} large />
      </section>

      {job.lineItems.length > 0 && app.can('view_financials') && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Line items · {money(job.total)}</summary>
          <div className="mt-2 space-y-1 text-sm">
            {job.lineItems.map((li) => (
              <div key={li.id} className="flex justify-between gap-2">
                <span>
                  {li.description} <span className="text-slate-400">× {li.quantity}</span>
                </span>
                <span>{money(li.quantity * li.unitPrice)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

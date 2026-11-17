import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeftRight, BookOpen, Briefcase, Building2, Car, Loader2, LogIn, LogOut, Wrench, X } from 'lucide-react';
import { post, useApi } from '../api';
import { useApp } from '../store';
import { hm, time } from '../format';
import type { ClockOptions, Job, TimeEntry } from '../../shared/types';

type Status = { entry: TimeEntry | null; todayMinutes: number };

function elapsed(from: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  'Shop work': Building2,
  Travel: Car,
  'Office / admin': Briefcase,
  Training: BookOpen,
  'Equipment upkeep': Wrench,
};

/** Hook for the signed-in tech's clock, shared by the home screen and job screen. */
export function useClock() {
  const app = useApp();
  const { data, reload } = useApi<Status>(app.currentUserId ? `/time/status/${app.currentUserId}` : null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    const r = setInterval(reload, 60000);
    return () => (clearInterval(t), clearInterval(r));
  }, [reload]);

  const act = async (path: string, body: object, done?: string) => {
    setBusy(true);
    try {
      const res = await post<{ automations?: string[] }>(path, body);
      app.announce(res);
      if (done) app.toast(done);
      await reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return {
    status: data,
    busy,
    /** Clock in to (or switch to) a job; its time counts as labor on that job. */
    clockInJob: (job: Pick<Job, 'id' | 'number'>) => act('/time/clock-in', { jobId: job.id }, `Clocked in to ${job.number}`),
    /** Clock in to (or switch to) general time, e.g. shop work. Not charged to any job. */
    clockInGeneral: (category: string) => act('/time/clock-in', { category }, `Clocked in: ${category}`),
    clockOut: () => act('/time/clock-out', {}, 'Clocked out'),
  };
}

export function ClockCard({ clock }: { clock: ReturnType<typeof useClock> }) {
  const app = useApp();
  const { status, busy } = clock;
  const entry = status?.entry;
  const div = entry?.job ? app.division(entry.job.divisionId) : undefined;
  const [choosing, setChoosing] = useState(false);

  if (!status) return <div className="card h-36 animate-pulse" />;
  const GeneralIcon = CATEGORY_ICONS[entry?.category ?? ''] ?? Building2;

  return (
    <>
      <section className={clsx('card overflow-hidden', entry && (entry.jobId ? 'border-emerald-300' : 'border-sky-300'))}>
        <div className="p-4">
          {entry ? (
            <>
              <div className={clsx('flex items-center gap-2 text-xs font-medium', entry.jobId ? 'text-emerald-700' : 'text-sky-700')}>
                <span className={clsx('h-2 w-2 animate-pulse rounded-full', entry.jobId ? 'bg-emerald-500' : 'bg-sky-500')} />
                {entry.jobId ? 'ON THE CLOCK · JOB TIME' : 'ON THE CLOCK · GENERAL TIME'}
              </div>
              <div className="mt-1 font-mono text-4xl font-bold tabular-nums">{elapsed(entry.startedAt)}</div>
              <div className="mt-1 text-sm text-slate-600">
                {entry.job ? (
                  <Link to={`/tech/jobs/${entry.jobId}`} className="font-medium" style={{ color: div?.color }}>
                    {entry.job.number} · {entry.job.title}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <GeneralIcon size={15} /> {entry.category ?? 'General time'}
                    {entry.notes && <span className="font-normal text-slate-500">· {entry.notes}</span>}
                  </span>
                )}
              </div>
              {entry.jobId && <div className="mt-0.5 text-xs text-slate-500">This time counts as labor on the job.</div>}
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-slate-500">OFF THE CLOCK</div>
              <div className="mt-1 text-2xl font-bold">Ready to start?</div>
            </>
          )}
          <div className="mt-1 text-xs text-slate-500">Today: {hm(status.todayMinutes)}</div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200">
          {!entry ? (
            <button
              disabled={busy}
              onClick={() => setChoosing(true)}
              className="col-span-2 flex items-center justify-center gap-2 bg-emerald-600 py-4 text-lg font-semibold text-white active:bg-emerald-700"
            >
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Clock in
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => setChoosing(true)} className="flex items-center justify-center gap-2 bg-white py-4 font-medium text-slate-700">
                <ArrowLeftRight size={18} /> Switch
              </button>
              <button disabled={busy} onClick={() => clock.clockOut()} className="flex items-center justify-center gap-2 bg-white py-4 font-medium text-rose-600">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />} Clock out
              </button>
            </>
          )}
        </div>
      </section>
      {choosing && <ClockChooser clock={clock} current={entry ?? null} onClose={() => setChoosing(false)} />}
    </>
  );
}

/** "What are you working on?" A job (job-costed) or a kind of general time. */
export function ClockChooser({ clock, current, onClose }: { clock: ReturnType<typeof useClock>; current: TimeEntry | null; onClose: () => void }) {
  const app = useApp();
  const { data } = useApi<ClockOptions>('/time/clock-options');
  const pick = async (fn: () => Promise<void>) => {
    onClose();
    await fn();
  };

  const JobRow = ({ job }: { job: Job }) => {
    const div = app.division(job.divisionId);
    const here = current?.jobId === job.id;
    return (
      <button
        disabled={here}
        onClick={() => pick(() => clock.clockInJob(job))}
        className="flex w-full items-center gap-3 rounded-lg border border-l-4 border-slate-200 bg-white p-3 text-left active:bg-slate-50 disabled:opacity-50"
        style={{ borderLeftColor: div?.color }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{job.title}</div>
          <div className="text-xs text-slate-500">
            {job.number}
            {job.scheduledStart && ` · ${time(job.scheduledStart)}`}
            {job.assigneeId && job.assigneeId !== app.currentUserId && ` · ${app.user(job.assigneeId)?.name.split(' ')[0]}'s job`}
          </div>
        </div>
        {here ? <span className="text-xs font-medium text-emerald-700">Clocked in</span> : <LogIn size={18} className="text-emerald-600" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40" onClick={onClose}>
      <div
        className="mx-auto max-h-[85vh] w-full max-w-md overflow-auto rounded-t-2xl bg-slate-50 p-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="What are you working on?"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">What are you working on?</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {!data ? (
          <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
        ) : (
          <div className="space-y-4">
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">A job · time is charged to the job</h3>
              <div className="space-y-2">
                {data.myJobs.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
                {!data.myJobs.length && <p className="text-sm text-slate-500">No jobs scheduled for you today.</p>}
              </div>
              {data.otherJobs.length > 0 && (
                <details className="mt-2" open={!data.myJobs.length}>
                  <summary className="cursor-pointer py-1 text-sm font-medium text-brand-700">Helping on another job ({data.otherJobs.length})</summary>
                  <div className="mt-2 space-y-2">
                    {data.otherJobs.map((j) => (
                      <JobRow key={j.id} job={j} />
                    ))}
                  </div>
                </details>
              )}
            </section>
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">General time · not charged to a job</h3>
              <div className="grid grid-cols-2 gap-2">
                {data.categories.map((c) => {
                  const Icon = CATEGORY_ICONS[c] ?? Building2;
                  const here = current && !current.jobId && current.category === c;
                  return (
                    <button
                      key={c}
                      disabled={!!here}
                      onClick={() => pick(() => clock.clockInGeneral(c))}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-medium active:bg-slate-50 disabled:opacity-50"
                    >
                      <Icon size={18} className="text-sky-600" /> {c}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Loader2, LogIn, LogOut, Pause } from 'lucide-react';
import { post, useApi } from '../api';
import { useApp } from '../store';
import { hm } from '../format';
import type { TimeEntry } from '../../shared/types';

type Status = { entry: TimeEntry | null; todayMinutes: number };

function elapsed(from: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Hook for the current user's clock state, shared by the home screen and job screen. */
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

  const act = async (path: string, body: object) => {
    setBusy(true);
    try {
      const res = await post<{ automations?: string[] }>(path, { userId: app.currentUserId, ...body });
      app.announce(res);
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
    clockIn: (jobId: number | null = null) => act('/time/clock-in', { jobId }),
    clockOut: () => act('/time/clock-out', {}),
  };
}

export function ClockCard({ clock }: { clock: ReturnType<typeof useClock> }) {
  const app = useApp();
  const { status, busy } = clock;
  const entry = status?.entry;
  const div = entry?.job ? app.division(entry.job.divisionId) : undefined;

  if (!status) return <div className="card h-36 animate-pulse" />;

  return (
    <section className={clsx('card overflow-hidden', entry && 'border-emerald-300')}>
      <div className="p-4">
        {entry ? (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> ON THE CLOCK
            </div>
            <div className="mt-1 font-mono text-4xl font-bold tabular-nums">{elapsed(entry.startedAt)}</div>
            <div className="mt-1 text-sm text-slate-600">
              {entry.job ? (
                <Link to={`/tech/jobs/${entry.jobId}`} className="font-medium" style={{ color: div?.color }}>
                  {entry.job.number} · {entry.job.title}
                </Link>
              ) : (
                entry.notes || 'General time (shop, travel, admin)'
              )}
            </div>
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
          <button disabled={busy} onClick={() => clock.clockIn()} className="col-span-2 flex items-center justify-center gap-2 bg-emerald-600 py-4 text-lg font-semibold text-white active:bg-emerald-700">
            {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Clock in
          </button>
        ) : (
          <>
            <button
              disabled={busy || !entry.jobId}
              onClick={() => clock.clockIn(null)}
              className="flex items-center justify-center gap-2 bg-white py-4 font-medium text-slate-700 disabled:text-slate-300"
            >
              <Pause size={18} /> Off job
            </button>
            <button disabled={busy} onClick={() => clock.clockOut()} className="flex items-center justify-center gap-2 bg-white py-4 font-medium text-rose-600">
              <LogOut size={18} /> Clock out
            </button>
          </>
        )}
      </div>
    </section>
  );
}

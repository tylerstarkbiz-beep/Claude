import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { localDate, time, todayISO } from '../format';
import { Avatar, Button, PageHeader } from '../components/ui';
import { JOB_STATUS_META, type Job } from '../../shared/types';

function startOfWeek(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
}

/** Week dispatch board: one row per team member, one column per day. */
export function Schedule() {
  const app = useApp();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);

  const params = new URLSearchParams({ from: localDate(weekStart), to: localDate(end) });
  if (app.divisionId) params.set('divisionId', String(app.divisionId));
  const { data: jobs } = useApi<Job[]>(`/jobs?${params}`);
  const unscheduled = useApi<Job[]>(`/jobs${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`).data?.filter(
    (j) => !j.scheduledStart && !['paid', 'cancelled', 'completed', 'invoiced'].includes(j.status),
  );

  const crew = app.activeUsers.filter((u) => !app.divisionId || u.divisionIds.includes(app.divisionId));
  const rows = [...crew.map((u) => ({ id: u.id as number | null, user: u })), { id: null, user: undefined }];
  const today = todayISO();

  const shift = (weeks: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + weeks * 7);
    setWeekStart(d);
  };

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={`${days[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => shift(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              This week
            </Button>
            <Button variant="secondary" onClick={() => shift(1)}>
              <ChevronRight size={16} />
            </Button>
          </>
        }
      />

      <div className="card overflow-x-auto">
        <div className="grid min-w-[1000px] grid-cols-[170px_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-slate-200" />
          {days.map((d) => {
            const iso = localDate(d);
            return (
              <div key={iso} className={clsx('border-b border-l border-slate-200 px-2 py-2 text-center text-xs', iso === today && 'bg-indigo-50 font-semibold text-indigo-700')}>
                {d.toLocaleDateString('en-US', { weekday: 'short' })} <span className="text-base">{d.getDate()}</span>
              </div>
            );
          })}

          {rows.map(({ id, user }) => (
            <div key={id ?? 'unassigned'} className="contents">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
                <Avatar user={user} size={26} />
                <span className="truncate">{user?.name ?? 'Unassigned'}</span>
              </div>
              {days.map((d) => {
                const iso = localDate(d);
                const cellJobs = (jobs ?? [])
                  .filter((j) => j.assigneeId === id && j.scheduledStart?.slice(0, 10) === iso)
                  .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));
                return (
                  <div key={iso} className={clsx('min-h-16 space-y-1 border-b border-l border-slate-100 p-1', iso === today && 'bg-indigo-50/40')}>
                    {cellJobs.map((j) => {
                      const div = app.division(j.divisionId);
                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          className="block rounded border-l-4 px-1.5 py-1 text-xs hover:brightness-95"
                          style={{ background: (div?.color ?? '#64748b') + '1a', borderLeftColor: div?.color }}
                          title={`${j.number} · ${JOB_STATUS_META[j.status].label}`}
                        >
                          <div className="font-medium text-slate-600">
                            {time(j.scheduledStart)}
                            {j.scheduledEnd && `–${time(j.scheduledEnd)}`}
                          </div>
                          <div className="truncate text-slate-800">{j.title}</div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!!unscheduled?.length && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Needs scheduling ({unscheduled.length})</h2>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="card border-l-4 px-3 py-2 text-sm hover:shadow" style={{ borderLeftColor: app.division(j.divisionId)?.color }}>
                <span className="font-mono text-xs text-slate-400">{j.number}</span> {j.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

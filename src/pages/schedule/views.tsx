import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useApp } from '../../store';
import { todayISO } from '../../format';
import { Avatar } from '../../components/ui';
import { JOB_STATUS_META, type Job } from '../../../shared/types';
import { PX_PER_MIN, addDays, clock, dateOf, duration, layoutLanes, minutesOf, startOfWeek } from './time';
import type { DragMode, DragState } from './drag';

type Bind = (job: Job, mode?: DragMode) => Record<string, unknown>;

export interface Column {
  key: string;
  date: string;
  /** Dropping here assigns this tech (null = unassigned); undefined keeps the job's tech. */
  userId?: number | null;
  header: ReactNode;
}

/** Start/end minutes of a job within its start date (clipped at midnight). */
function span(job: Job) {
  const s = minutesOf(job.scheduledStart!);
  return { s, e: Math.min(24 * 60, s + duration(job)) };
}

function JobBlock({ job, showTech, compact, bind, canEdit, ghost }: { job: Job; showTech?: boolean; compact?: boolean; bind: Bind; canEdit: boolean; ghost?: boolean }) {
  const app = useApp();
  const div = app.division(job.divisionId);
  const { s, e } = span(job);
  const tech = app.user(job.assigneeId);
  return (
    <div
      role="button"
      tabIndex={0}
      data-block="timed"
      {...(ghost ? {} : bind(job))}
      className={clsx(
        'group absolute inset-0 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        canEdit && !ghost ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer',
        job.status === 'completed' || job.status === 'paid' || job.status === 'invoiced' ? 'opacity-70' : '',
      )}
      style={{ background: `color-mix(in oklab, ${div?.color ?? '#64748b'} 16%, white)`, borderLeftColor: div?.color }}
      title={`${job.number} · ${job.title} · ${JOB_STATUS_META[job.status].label}${tech ? ` · ${tech.name}` : ''}`}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-700">
            {clock(s)}–{clock(e)}
          </div>
          <div className={clsx('font-medium leading-tight text-slate-900', compact ? 'truncate' : 'line-clamp-2')}>{job.title}</div>
          {!compact && <div className="truncate text-[11px] text-slate-500">{job.number}</div>}
        </div>
        {showTech && <Avatar user={tech} size={18} />}
      </div>
      {canEdit && !ghost && (
        <div
          {...bind(job, 'resize')}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100"
          title="Drag to change the end time"
        >
          <div className="mx-auto mt-0.5 h-1 w-6 rounded-full bg-slate-400" />
        </div>
      )}
    </div>
  );
}

/** Hour grid used by the day (one column per tech) and week (one column per day) views. */
export function TimeGrid({
  columns,
  jobs,
  columnOf,
  startMin,
  endMin,
  drag,
  bind,
  canEdit,
  showTech,
}: {
  columns: Column[];
  jobs: Job[];
  columnOf: (job: Job) => string | null;
  startMin: number;
  endMin: number;
  drag: DragState | null;
  bind: Bind;
  canEdit: boolean;
  showTech?: boolean;
}) {
  const hours: number[] = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);
  const height = (endMin - startMin) * PX_PER_MIN;
  const today = todayISO();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const minCol = columns.length > 5 ? 120 : 0;

  // Where the dragged job would land.
  const t = drag?.target?.kind === 'time' ? drag.target : null;
  const preview = (col: Column) => {
    if (!t || !drag || t.date !== col.date) return null;
    if (col.userId !== undefined) {
      const dest = t.userId === undefined ? drag.job.assigneeId : t.userId;
      if (dest !== col.userId) return null;
    }
    if (drag.mode === 'resize') return { s: minutesOf(drag.job.scheduledStart!), e: Math.max(minutesOf(drag.job.scheduledStart!) + 15, t.minutes) };
    return { s: t.minutes, e: Math.min(24 * 60, t.minutes + duration(drag.job)) };
  };

  return (
    <div className="card overflow-x-auto">
      <div style={{ minWidth: columns.length * minCol + 56 }}>
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div className="w-14 shrink-0" />
          {columns.map((c) => (
            <div key={c.key} className={clsx('min-w-0 flex-1 border-l border-slate-200 px-2 py-2', c.date === today && columns.length === 7 && 'bg-brand-50')}>
              {c.header}
            </div>
          ))}
        </div>
        <div className="relative flex" style={{ height }}>
          <div className="relative w-14 shrink-0">
            {hours.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: (m - startMin) * PX_PER_MIN }}>
                {m === startMin ? '' : clock(m)}
              </div>
            ))}
          </div>
          {columns.map((col) => {
            const mine = jobs.filter((j) => columnOf(j) === col.key);
            const laid = layoutLanes(mine.map((j) => ({ ...span(j), job: j })));
            const p = preview(col);
            return (
              <div
                key={col.key}
                data-drop="time"
                data-date={col.date}
                data-start-min={startMin}
                {...(col.userId === undefined ? {} : { 'data-user': col.userId === null ? 'none' : String(col.userId) })}
                className={clsx('relative min-w-0 flex-1 border-l border-slate-200', col.date === today && columns.length === 7 && 'bg-brand-50/40')}
              >
                {hours.map((m) => (
                  <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: (m - startMin) * PX_PER_MIN }} />
                ))}
                {laid.map(({ job, s, e, lane, lanes }) => (
                  <div
                    key={job.id}
                    className={clsx('absolute px-0.5', drag?.job.id === job.id && 'opacity-30')}
                    style={{
                      top: (Math.max(s, startMin) - startMin) * PX_PER_MIN,
                      height: Math.max(22, (Math.min(e, endMin) - Math.max(s, startMin)) * PX_PER_MIN - 2),
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                    }}
                  >
                    <JobBlock job={job} bind={bind} canEdit={canEdit} showTech={showTech} compact={e - s < 60} />
                  </div>
                ))}
                {p && drag && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-dashed border-brand-600 bg-brand-100/70 px-1.5 py-1 text-xs font-semibold text-brand-800"
                    style={{ top: (p.s - startMin) * PX_PER_MIN, height: Math.max(22, (p.e - p.s) * PX_PER_MIN - 2) }}
                  >
                    {clock(p.s)}–{clock(p.e)}
                    <div className="truncate font-medium">{drag.job.title}</div>
                  </div>
                )}
                {col.date === today && nowMin >= startMin && nowMin <= endMin && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-accent-500" style={{ top: (nowMin - startMin) * PX_PER_MIN }}>
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-accent-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Month calendar: Monday-first weeks, a few jobs per day, drag to another day. */
export function MonthGrid({
  month,
  jobs,
  drag,
  bind,
  canEdit,
  onOpenDay,
}: {
  month: string; // any date in the month
  jobs: Job[];
  drag: DragState | null;
  bind: Bind;
  canEdit: boolean;
  onOpenDay: (date: string) => void;
}) {
  const app = useApp();
  const first = month.slice(0, 8) + '01';
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weeks = days[35].slice(0, 7) === month.slice(0, 7) ? 6 : 5;
  const today = todayISO();
  const target = drag?.target?.kind === 'day' ? drag.target.date : null;
  const MAX = 3;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.slice(0, weeks * 7).map((date) => {
            const inMonth = date.slice(0, 7) === month.slice(0, 7);
            const dayJobs = jobs.filter((j) => dateOf(j.scheduledStart!) === date).sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!));
            return (
              <div
                key={date}
                data-drop="day"
                data-date={date}
                className={clsx(
                  'min-h-28 border-b border-l border-slate-100 p-1.5',
                  !inMonth && 'bg-slate-50/70',
                  target === date && 'bg-brand-50 ring-2 ring-inset ring-brand-500',
                )}
              >
                <button
                  onClick={() => onOpenDay(date)}
                  className={clsx(
                    'mb-1 grid h-6 w-6 place-items-center rounded-full text-xs',
                    date === today ? 'bg-brand-600 font-semibold text-white' : inMonth ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400',
                  )}
                  title="Open this day"
                >
                  {Number(date.slice(8))}
                </button>
                <div className="space-y-0.5">
                  {dayJobs.slice(0, MAX).map((j) => {
                    const div = app.division(j.divisionId);
                    return (
                      <div
                        key={j.id}
                        role="button"
                        tabIndex={0}
                        {...bind(j)}
                        className={clsx(
                          'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                          canEdit ? 'cursor-grab touch-none' : 'cursor-pointer',
                          drag?.job.id === j.id && 'opacity-30',
                        )}
                        style={{ background: `color-mix(in oklab, ${div?.color ?? '#64748b'} 16%, white)` }}
                        title={`${j.number} · ${j.title}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: div?.color }} />
                        <span className="font-semibold text-slate-600">{clock(minutesOf(j.scheduledStart!))}</span>
                        <span className="truncate text-slate-800">{j.title}</span>
                      </div>
                    );
                  })}
                  {dayJobs.length > MAX && (
                    <button onClick={() => onOpenDay(date)} className="px-1 text-[11px] font-medium text-brand-600 hover:underline">
                      +{dayJobs.length - MAX} more
                    </button>
                  )}
                  {target === date && drag && (
                    <div className="truncate rounded border border-dashed border-brand-600 bg-white px-1 py-0.5 text-[11px] font-medium text-brand-800">
                      {clock(drag.job.scheduledStart ? minutesOf(drag.job.scheduledStart) : 9 * 60)} {drag.job.title}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


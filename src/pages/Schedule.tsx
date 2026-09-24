import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { todayISO } from '../format';
import { Avatar, Button, PageHeader } from '../components/ui';
import { JOB_STATUS_META, type Job } from '../../shared/types';
import { SNAP, addDays, at, clockLong, dateOf, duration, minutesOf, startOfWeek } from './schedule/time';
import { useScheduleDrag, type DragMode, type DropTarget } from './schedule/drag';
import { MonthGrid, TimeGrid, type Column } from './schedule/views';

type View = 'day' | 'week' | 'month';
const VIEWS: [View, string][] = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];

function storedView(): View {
  try {
    const v = localStorage.getItem('fb.scheduleView');
    return v === 'day' || v === 'week' || v === 'month' ? v : 'week';
  } catch {
    return 'week';
  }
}

const long = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T00:00').toLocaleDateString('en-US', opts);

/** Calendar of jobs by day, week or month. Drag jobs to reschedule or reassign them. */
export function Schedule() {
  const app = useApp();
  const navigate = useNavigate();
  const canEdit = app.can('manage_jobs');
  const [view, setViewState] = useState<View>(storedView);
  const [date, setDate] = useState(todayISO());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem('fb.scheduleView', v);
    } catch {
      // Not saved; the view still switches.
    }
  };

  // Visible date range for the current view.
  const range =
    view === 'day'
      ? { from: date, to: addDays(date, 1) }
      : view === 'week'
        ? { from: startOfWeek(date), to: addDays(startOfWeek(date), 7) }
        : { from: startOfWeek(date.slice(0, 8) + '01'), to: addDays(startOfWeek(date.slice(0, 8) + '01'), 42) };
  const div = app.divisionId ? `&divisionId=${app.divisionId}` : '';
  const { data: jobsData, setData: setJobs, reload } = useApi<Job[]>(`/jobs?from=${range.from}&to=${range.to}${div}`);
  const { data: unscheduled, reload: reloadTray } = useApi<Job[]>(`/jobs?unscheduled=1${div}`);
  const jobs = (jobsData ?? []).filter((j) => j.scheduledStart && j.status !== 'cancelled' && !(j.assigneeId && hidden.has(j.assigneeId)));

  async function drop(job: Job, mode: DragMode, t: DropTarget) {
    const dur = duration(job);
    let start: string;
    let end: string;
    let assigneeId: number | null | undefined;
    if (mode === 'resize' && t.kind === 'time' && job.scheduledStart) {
      start = job.scheduledStart;
      end = at(t.date, Math.max(minutesOf(start) + SNAP, t.minutes));
    } else if (t.kind === 'time') {
      start = at(t.date, t.minutes);
      end = at(t.date, t.minutes + dur);
      assigneeId = t.userId;
    } else {
      const m = job.scheduledStart ? minutesOf(job.scheduledStart) : 9 * 60;
      start = at(t.date, m);
      end = at(t.date, m + dur);
    }
    const reassign = assigneeId !== undefined && assigneeId !== job.assigneeId;
    if (start === job.scheduledStart?.slice(0, 16) && end === job.scheduledEnd?.slice(0, 16) && !reassign) return;

    const body: Partial<Job> = { scheduledStart: start, scheduledEnd: end };
    if (reassign) body.assigneeId = assigneeId;
    // Putting a request or quote on the calendar means it's booked.
    if (job.status === 'request' || job.status === 'quoted') body.status = 'scheduled';

    setJobs((list) => {
      const rest = (list ?? []).filter((j) => j.id !== job.id);
      return [...rest, { ...job, ...body }];
    });
    try {
      const res = await patch<Job & { automations?: string[] }>(`/jobs/${job.id}`, body);
      const who = reassign ? ` for ${app.user(assigneeId)?.name ?? 'nobody (unassigned)'}` : '';
      app.toast(
        mode === 'resize'
          ? `${job.number} now ends at ${clockLong(minutesOf(end))}`
          : `${job.number} moved to ${long(dateOf(start), { weekday: 'short', month: 'short', day: 'numeric' })}, ${clockLong(minutesOf(start))}${who}`,
      );
      app.announce(res);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
    reload();
    reloadTray();
  }

  const { drag, bind } = useScheduleDrag({ enabled: canEdit, onDrop: drop, onClick: (job) => navigate(`/jobs/${job.id}`) });

  const step = (n: number) => {
    if (view === 'day') setDate(addDays(date, n));
    else if (view === 'week') setDate(addDays(date, 7 * n));
    else {
      const d = new Date(date.slice(0, 8) + '01T00:00');
      d.setMonth(d.getMonth() + n);
      setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };
  const title =
    view === 'day'
      ? long(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : view === 'week'
        ? `${long(range.from, { month: 'short', day: 'numeric' })} – ${long(addDays(range.from, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
        : long(date, { month: 'long', year: 'numeric' });

  const crew = app.activeUsers.filter((u) => !app.divisionId || u.divisionIds.includes(app.divisionId));

  // Hour range: 6am–9pm, stretched to fit any job outside it.
  let startMin = 6 * 60;
  let endMin = 21 * 60;
  for (const j of jobs) {
    const s = minutesOf(j.scheduledStart!);
    startMin = Math.min(startMin, Math.floor(s / 60) * 60);
    endMin = Math.max(endMin, Math.min(24 * 60, Math.ceil((s + duration(j)) / 60) * 60));
  }

  let grid;
  if (view === 'month') {
    grid = <MonthGrid month={date} jobs={jobs} drag={drag} bind={bind} canEdit={canEdit} onOpenDay={(d) => (setDate(d), setView('day'))} />;
  } else if (view === 'week') {
    const columns: Column[] = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(range.from, i);
      return {
        key: d,
        date: d,
        header: (
          <button onClick={() => (setDate(d), setView('day'))} className="w-full text-center text-xs text-slate-500 hover:text-brand-700" title="Open this day">
            {long(d, { weekday: 'short' })}{' '}
            <span className={clsx('text-base font-semibold', d === todayISO() ? 'text-brand-700' : 'text-slate-800')}>{Number(d.slice(8))}</span>
          </button>
        ),
      };
    });
    grid = (
      <TimeGrid columns={columns} jobs={jobs} columnOf={(j) => dateOf(j.scheduledStart!)} startMin={startMin} endMin={endMin} drag={drag} bind={bind} canEdit={canEdit} showTech />
    );
  } else {
    const people = crew.filter((u) => !hidden.has(u.id));
    const columns: Column[] = [
      ...people.map((u) => ({
        key: String(u.id),
        date,
        userId: u.id as number | null,
        header: (
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Avatar user={u} size={22} />
            <span className="truncate">{u.name}</span>
          </div>
        ),
      })),
      {
        key: 'none',
        date,
        userId: null,
        header: (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Avatar size={22} /> Unassigned
          </div>
        ),
      },
    ];
    const known = new Set(people.map((u) => u.id));
    grid = (
      <TimeGrid
        columns={columns}
        jobs={jobs.filter((j) => dateOf(j.scheduledStart!) === date)}
        columnOf={(j) => (j.assigneeId && known.has(j.assigneeId) ? String(j.assigneeId) : j.assigneeId && hidden.has(j.assigneeId) ? null : 'none')}
        startMin={startMin}
        endMin={endMin}
        drag={drag}
        bind={bind}
        canEdit={canEdit}
      />
    );
  }

  const tray = (unscheduled ?? []).filter((j) => !(j.assigneeId && hidden.has(j.assigneeId)));

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Schedule"
        subtitle={title}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              {VIEWS.map(([v, label]) => (
                <button key={v} onClick={() => setView(v)} className={clsx('rounded-md px-3 py-1.5 text-sm', view === v ? 'bg-brand-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100')}>
                  {label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" onClick={() => setDate(todayISO())}>
              Today
            </Button>
            <Button variant="secondary" onClick={() => step(1)} aria-label="Next">
              <ChevronRight size={16} />
            </Button>
            <label className="relative">
              <span className="sr-only">Go to date</span>
              <input type="date" className="input w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Crew</span>
        {crew.map((u) => (
          <button
            key={u.id}
            onClick={() => setHidden((h) => (h.has(u.id) ? new Set([...h].filter((x) => x !== u.id)) : new Set([...h, u.id])))}
            className={clsx('flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs', hidden.has(u.id) ? 'border-slate-200 text-slate-400 opacity-60' : 'border-slate-300 bg-white')}
            title={hidden.has(u.id) ? `Show ${u.name}` : `Hide ${u.name}`}
          >
            <Avatar user={u} size={20} /> {u.name.split(' ')[0]}
          </button>
        ))}
        {hidden.size > 0 && (
          <button className="text-xs text-brand-600 hover:underline" onClick={() => setHidden(new Set())}>
            Show everyone
          </button>
        )}
        {canEdit && <span className="ml-auto hidden text-xs text-slate-500 md:block">Drag a job to change its time{view === 'day' ? ' or tech' : ''}; drag its bottom edge to change how long it runs.</span>}
      </div>

      {tray.length > 0 && (
        <section className="card mb-4 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <CalendarDays size={16} /> Needs scheduling ({tray.length})
            {canEdit && <span className="font-normal text-slate-400">— drag onto the calendar</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {tray.map((j) => (
              <div
                key={j.id}
                role="button"
                tabIndex={0}
                {...bind(j)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md border border-l-4 border-slate-200 bg-white py-1.5 pl-1 pr-2.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  canEdit ? 'cursor-grab touch-none' : 'cursor-pointer',
                  drag?.job.id === j.id && 'opacity-30',
                )}
                style={{ borderLeftColor: app.division(j.divisionId)?.color }}
              >
                {canEdit && <GripVertical size={14} className="text-slate-300" />}
                <span className="font-mono text-xs text-slate-400">{j.number}</span>
                <span className="max-w-60 truncate">{j.title}</span>
                <span className="rounded px-1 text-[10px] text-white" style={{ background: JOB_STATUS_META[j.status].color }}>
                  {JOB_STATUS_META[j.status].label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {grid}

      {drag && !drag.target && (
        <div className="pointer-events-none fixed z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {drag.job.title}
        </div>
      )}
    </div>
  );
}

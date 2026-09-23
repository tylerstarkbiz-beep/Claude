import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardCheck,
  FileText,
  Plus,
  ShieldCheck,
  StickyNote,
  Trash2,
  Wrench,
} from 'lucide-react';
import { del, patch, post, api, useApi } from '../api';
import { useApp } from '../store';
import { addDays, hm, longDate, time, todayISO } from '../format';
import { Avatar, Button, PageHeader, StatusCell } from '../components/ui';
import { TaskDrawer, statusOptions } from '../components/TaskDrawer';
import type { DailyLog, DailyReport, DailySummary, Task, User } from '../../shared/types';

function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = todayISO();
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" onClick={() => onChange(addDays(date, -1))} aria-label="Previous day">
        <ChevronLeft size={16} />
      </Button>
      <input type="date" className="input w-40" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <Button variant="secondary" onClick={() => onChange(addDays(date, 1))} aria-label="Next day">
        <ChevronRight size={16} />
      </Button>
      {date !== today && (
        <Button variant="ghost" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

const canReview = (u?: User) => u?.role === 'owner' || u?.role === 'manager';

/** Team overview: one card per employee for the chosen day. */
export function DailyLogs() {
  const app = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayISO();
  const { data } = useApi<DailySummary[]>(`/daily?date=${date}`);
  const people = app.users.filter((u) => !app.divisionId || u.divisionIds.includes(app.divisionId));
  const rows = people.map((u) => ({ user: u, s: data?.find((d) => d.userId === u.id) }));
  const submitted = rows.filter((r) => r.s?.submitted).length;
  const needsReview = rows.filter((r) => r.s?.submitted && !r.s.reviewed).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Daily Logs"
        subtitle={
          <>
            {longDate(date)} · {submitted}/{rows.length} reports submitted
            {needsReview > 0 && <span className="text-amber-600"> · {needsReview} waiting for your sign-off</span>}
          </>
        }
        actions={<DateNav date={date} onChange={(d) => setParams({ date: d })} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ user, s }) => {
          const pct = s && s.itemsTotal ? Math.round((s.itemsDone / s.itemsTotal) * 100) : 0;
          return (
            <button key={user.id} onClick={() => navigate(`/daily/${user.id}/${date}`)} className="card p-4 text-left transition hover:shadow-md">
              <div className="mb-3 flex items-center gap-3">
                <Avatar user={user} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{user.name}</div>
                  <div className="text-xs capitalize text-slate-500">{user.role}</div>
                </div>
                {s?.clockedIn ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> On the clock
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Off</span>
                )}
              </div>

              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Checklist</span>
                  <span>
                    {s?.itemsDone ?? 0}/{s?.itemsTotal ?? 0}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={clsx('h-full', pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat icon={<Clock size={14} />} value={hm(s?.totalMinutes ?? 0)} label="hours" />
                <Stat icon={<Wrench size={14} />} value={s?.jobs ?? 0} label="jobs" />
                <Stat icon={<CheckCircle2 size={14} />} value={s?.tasksCompleted ?? 0} label="tasks" />
                <Stat icon={<StickyNote size={14} />} value={s?.notes ?? 0} label="notes" />
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                {s?.reviewed ? (
                  <span className="flex items-center gap-1 font-medium text-emerald-700">
                    <ShieldCheck size={14} /> Report signed off
                  </span>
                ) : s?.submitted ? (
                  <span className="flex items-center gap-1 font-medium text-amber-600">
                    <FileText size={14} /> Report submitted: needs review
                  </span>
                ) : (
                  <span className="text-slate-400">No end-of-day report yet</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="rounded-md bg-slate-50 py-1.5">
      <div className="flex items-center justify-center gap-1 font-semibold text-slate-700">
        {icon}
        {value}
      </div>
      <div className="text-slate-400">{label}</div>
    </div>
  );
}

/** One employee's day: checklist, tasks, time, notes and end-of-day report. */
export function DailyLogDetail() {
  const { userId, date } = useParams() as { userId: string; date: string };
  const app = useApp();
  const navigate = useNavigate();
  const { data: log, reload } = useApi<DailyLog>(`/daily/${userId}/${date}`);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const user = app.user(Number(userId));
  const go = (u: string | number, d: string) => navigate(`/daily/${u}/${d}`);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={`/daily?date=${date}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft size={15} /> Team daily logs
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar user={user} size={44} />
          <div>
            <select
              className="-ml-1 rounded bg-transparent px-1 text-2xl font-bold tracking-tight outline-none hover:bg-white"
              value={userId}
              onChange={(e) => go(e.target.value, date)}
            >
              {app.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <div className="text-sm text-slate-500">{longDate(date)}</div>
          </div>
        </div>
        <DateNav date={date} onChange={(d) => go(userId, d)} />
      </div>

      {!log ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6">
            <Checklist log={log} onChange={reload} />
            <TasksCard log={log} onOpen={setOpenTask} onChange={reload} />
            <ReportCard key={`${log.userId}-${log.date}`} log={log} user={user} onChange={reload} />
          </div>
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Total time" value={hm(log.totalMinutes)} />
              <Kpi label="On jobs" value={hm(log.jobMinutes)} />
              <Kpi label="Jobs" value={log.jobs.length} />
            </div>
            <Timeline log={log} />
          </div>
        </div>
      )}
      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function Checklist({ log, onChange, large }: { log: DailyLog; onChange: () => void; large?: boolean }) {
  const app = useApp();
  const [title, setTitle] = useState('');
  const done = log.items.filter((i) => i.doneAt).length;

  async function toggle(itemId: number, isDone: boolean) {
    await patch(`/daily-items/${itemId}`, { done: !isDone });
    onChange();
  }
  async function add() {
    if (!title.trim()) return;
    await post(`/daily/${log.userId}/${log.date}/items`, { title, createdBy: app.currentUserId });
    setTitle('');
    onChange();
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardCheck size={18} className="text-indigo-600" /> Daily checklist
        </h2>
        <span className="text-sm text-slate-500">
          {done}/{log.items.length}
        </span>
      </div>
      <div className="space-y-1">
        {log.items.map((item) => (
          <div key={item.id} className="group flex items-center gap-3 rounded-md px-1 hover:bg-slate-50">
            <button
              onClick={() => toggle(item.id, !!item.doneAt)}
              className={clsx(
                'grid shrink-0 place-items-center rounded-md border-2 transition',
                large ? 'h-7 w-7' : 'h-5 w-5',
                item.doneAt ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-400',
              )}
              aria-label={item.doneAt ? 'Mark not done' : 'Mark done'}
            >
              {item.doneAt && <Check size={large ? 18 : 13} strokeWidth={3} />}
            </button>
            <span className={clsx('flex-1', large ? 'py-3 text-base' : 'py-1.5 text-sm', item.doneAt && 'text-slate-400 line-through')}>
              {item.title}
              {!item.templateId && item.createdBy && item.createdBy !== log.userId && (
                <span className="ml-2 text-xs text-indigo-600 no-underline">assigned by {app.user(item.createdBy)?.name.split(' ')[0]}</span>
              )}
            </span>
            {item.doneAt && <span className="text-xs text-slate-400">{time(item.doneAt)}</span>}
            {!item.templateId && (
              <button
                className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                onClick={async () => (await del(`/daily-items/${item.id}`), onChange())}
                aria-label="Remove"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {!log.items.length && <p className="text-sm text-slate-400">Nothing on the checklist for this day.</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder={log.userId === app.currentUserId ? 'Add something to your list…' : 'Assign an item for this day…'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <Button variant="secondary" onClick={add} aria-label="Add item">
          <Plus size={16} />
        </Button>
      </div>
    </section>
  );
}

function TasksCard({ log, onOpen, onChange }: { log: DailyLog; onOpen: (id: number) => void; onChange: () => void }) {
  const app = useApp();
  async function setStatus(t: Task, status: Task['status']) {
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${t.id}`, { status });
    app.announce(res);
    onChange();
  }
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <CalendarCheck size={18} className="text-indigo-600" /> Tasks
      </h2>
      {log.tasksOpen.length > 0 && (
        <>
          <div className="mb-1.5 text-xs font-medium text-slate-500">{log.date === todayISO() ? 'Due today or overdue' : 'Due this day'}</div>
          <div className="mb-4 space-y-1.5">
            {log.tasksOpen.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border border-slate-200 text-sm">
                <div className="h-8 w-24 shrink-0">
                  <StatusCell value={t.status} options={statusOptions} onChange={(s) => setStatus(t, s)} className="rounded-l-md" />
                </div>
                <button onClick={() => onOpen(t.id)} className="min-w-0 flex-1 truncate text-left hover:underline">
                  {t.title}
                </button>
                <span className={clsx('mr-2 shrink-0 text-xs', t.dueDate && t.dueDate < log.date ? 'text-rose-600' : 'text-slate-400')}>{t.dueDate}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mb-1.5 text-xs font-medium text-slate-500">Completed ({log.tasksCompleted.length})</div>
      <div className="space-y-1">
        {log.tasksCompleted.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-slate-50">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-xs text-slate-400">{t.completedAt && time(t.completedAt)}</span>
          </button>
        ))}
        {!log.tasksCompleted.length && <p className="text-sm text-slate-400">None yet.</p>}
      </div>
    </section>
  );
}

export function ReportCard({ log, user, onChange, large }: { log: DailyLog; user?: User; onChange: () => void; large?: boolean }) {
  const app = useApp();
  const me = app.user(app.currentUserId);
  const [draft, setDraft] = useState<Pick<DailyReport, 'summary' | 'issues' | 'tomorrow'>>({
    summary: log.report.summary,
    issues: log.report.issues,
    tomorrow: log.report.tomorrow,
  });
  const dirty = draft.summary !== log.report.summary || draft.issues !== log.report.issues || draft.tomorrow !== log.report.tomorrow;

  async function save(submit: boolean) {
    await api(`/daily/${log.userId}/${log.date}/report`, { method: 'PUT', body: { ...draft, submit } });
    app.toast(submit ? 'Daily report submitted' : 'Draft saved');
    onChange();
  }
  async function review(undo = false) {
    await post(`/daily/${log.userId}/${log.date}/review`, { reviewerId: app.currentUserId, undo });
    onChange();
  }

  const field = (key: keyof typeof draft, label: string, placeholder: string) => (
    <div>
      <span className="label">{label}</span>
      <textarea
        className={clsx('input', large && 'text-base')}
        rows={key === 'summary' ? 3 : 2}
        placeholder={placeholder}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText size={18} className="text-indigo-600" /> End-of-day report
        </h2>
        {log.report.reviewedAt ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <ShieldCheck size={14} /> Signed off by {app.user(log.report.reviewedBy)?.name ?? 'manager'} at {time(log.report.reviewedAt)}
          </span>
        ) : log.report.submittedAt ? (
          <span className="text-xs font-medium text-amber-600">Submitted {time(log.report.submittedAt)}</span>
        ) : null}
      </div>
      <div className="space-y-3">
        {field('summary', 'What got done', 'Jobs worked, progress made…')}
        {field('issues', 'Issues / needs', 'Equipment problems, customer concerns, parts needed…')}
        {field('tomorrow', 'Plan for tomorrow', 'First stop, what to bring…')}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {canReview(me) && me?.id !== user?.id && log.report.submittedAt && (
          <Button variant="secondary" onClick={() => review(!!log.report.reviewedAt)}>
            <ShieldCheck size={16} /> {log.report.reviewedAt ? 'Undo sign-off' : 'Sign off'}
          </Button>
        )}
        <Button variant="secondary" disabled={!dirty} onClick={() => save(false)}>
          Save draft
        </Button>
        <Button onClick={() => save(true)} className={clsx(large && 'py-3')}>
          {log.report.submittedAt ? 'Resubmit' : 'Submit report'}
        </Button>
      </div>
    </section>
  );
}

type Event = { at: string; kind: 'time' | 'check' | 'task' | 'note'; node: ReactNode };

/** Everything that happened, in order: time blocks, checklist ticks, finished tasks, notes & photos. */
function Timeline({ log }: { log: DailyLog }) {
  const app = useApp();
  const events: Event[] = [
    ...log.timeEntries.map((e) => {
      const div = e.job ? app.division(e.job.divisionId) : undefined;
      const minutes = Math.round(((e.endedAt ? new Date(e.endedAt) : new Date()).getTime() - new Date(e.startedAt).getTime()) / 60000);
      return {
        at: e.startedAt,
        kind: 'time' as const,
        node: (
          <div className="rounded-md border-l-4 bg-slate-50 px-3 py-2" style={{ borderLeftColor: div?.color ?? '#94a3b8' }}>
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                {time(e.startedAt)} – {e.endedAt ? time(e.endedAt) : <span className="font-medium text-emerald-600">now</span>}
              </span>
              <span className="font-medium text-slate-700">{hm(minutes)}</span>
            </div>
            <div className="text-sm">
              {e.job ? (
                <Link to={`/jobs/${e.jobId}`} className="hover:text-indigo-600">
                  <span className="font-mono text-xs text-slate-400">{e.job.number}</span> {e.job.title}
                </Link>
              ) : (
                <span className="text-slate-600">{e.notes || 'General time'}</span>
              )}
            </div>
          </div>
        ),
      };
    }),
    ...log.items
      .filter((i) => i.doneAt)
      .map((i) => ({ at: i.doneAt!, kind: 'check' as const, node: <span className="text-sm text-slate-600">Checked off: {i.title}</span> })),
    ...log.tasksCompleted
      .filter((t) => t.completedAt)
      .map((t) => ({ at: t.completedAt!, kind: 'task' as const, node: <span className="text-sm">Completed task: <b className="font-medium">{t.title}</b></span> })),
    ...log.notes.map((n) => ({
      at: n.createdAt,
      kind: 'note' as const,
      node: (
        <div className="text-sm">
          <Link to={`/jobs/${n.jobId}`} className="text-xs text-slate-500 hover:text-indigo-600">
            Note on {n.job.number}
          </Link>
          {n.body && <p className="line-clamp-3 whitespace-pre-wrap">{n.body}</p>}
          {n.photos.length > 0 && (
            <div className="mt-1 flex gap-1">
              {n.photos.slice(0, 4).map((p) => (
                <img key={p.id} src={p.url} className="h-12 w-12 rounded object-cover" />
              ))}
            </div>
          )}
        </div>
      ),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const icon = { time: Clock, check: ClipboardCheck, task: CheckCircle2, note: StickyNote };

  return (
    <section className="card p-5">
      <h2 className="mb-4 font-semibold">Day timeline</h2>
      {!events.length && <p className="text-sm text-slate-400">No activity logged for this day.</p>}
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {events.map((ev, i) => {
          const Icon = icon[ev.kind];
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[29px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-white text-slate-400">
                <Icon size={14} />
              </span>
              {ev.kind !== 'time' && <div className="text-xs text-slate-400">{time(ev.at)}</div>}
              {ev.node}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

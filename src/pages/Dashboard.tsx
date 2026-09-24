import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, ChevronRight, DollarSign, ListTodo, Wrench } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { dateTime, hm, minutesSince, money, relative, shortDate, todayISO } from '../format';
import { Avatar, DivisionBadge, PageHeader, Pill, StatusBattery, divisionIcon } from '../components/ui';
import { DrillDown } from '../components/DrillDown';
import { JOB_STATUS_META, type DashboardListKind, type DashboardStats, type Job } from '../../shared/types';

export function Dashboard() {
  const app = useApp();
  const { data } = useApi<DashboardStats>(`/dashboard${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`);
  const { data: allJobs } = useApi<Job[]>('/jobs');
  const [drill, setDrill] = useState<{ kind: DashboardListKind; divisionId: number | null } | null>(null);
  if (!data) return <div className="text-slate-400">Loading…</div>;

  const t = data.totals;
  const me = app.user(app.currentUserId);
  const money$ = app.can('view_financials');
  const open = (kind: DashboardListKind, divisionId = app.divisionId) => setDrill({ kind, divisionId });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}${me ? `, ${me.name.split(' ')[0]}` : ''}`}
        subtitle={app.divisionId ? `${app.division(app.divisionId)?.name} overview` : 'Company-wide overview across every division'}
      />

      <div className={clsx('mb-6 grid grid-cols-2 gap-4', money$ ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <Kpi icon={Wrench} label="Open jobs" value={t.openJobs} onClick={() => open('open_jobs')} />
        <Kpi icon={CalendarClock} label="On the schedule today" value={t.scheduledToday} onClick={() => open('today')} />
        {money$ && (
          <Kpi icon={DollarSign} label="Revenue this month" value={money(t.revenueMonth)} sub={`${money(t.outstanding)} invoiced & unpaid`} onClick={() => open('revenue')} />
        )}
        <Kpi icon={ListTodo} label="Open tasks" value={t.openTasks} sub={`${t.overdueTasks} overdue`} alert={t.overdueTasks > 0} onClick={() => open('open_tasks')} />
      </div>

      {!app.divisionId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.divisions.map((d) => {
            const div = app.division(d.divisionId)!;
            const Icon = divisionIcon(div.icon);
            const Row = ({ label, kind, children, className }: { label: string; kind: DashboardListKind; children: React.ReactNode; className?: string }) => (
              <button onClick={() => open(kind, div.id)} className="-mx-2 flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
                <span className="text-slate-500">{label}</span>
                <span className={clsx('font-medium tabular-nums', className)}>{children}</span>
              </button>
            );
            return (
              <div key={d.divisionId} className="card border-t-4 p-4" style={{ borderTopColor: div.color }}>
                <button onClick={() => app.setDivisionId(div.id)} className="mb-2 flex items-center gap-2 font-semibold hover:underline" style={{ color: div.color }} title={`Switch to ${div.name}`}>
                  <Icon size={18} /> {div.name}
                </button>
                <div className="flex flex-col">
                  <Row label="Open jobs" kind="open_jobs">
                    {d.openJobs}
                  </Row>
                  <Row label="Today" kind="today">
                    {d.scheduledToday}
                  </Row>
                  {money$ && (
                    <Row label="Revenue (mo)" kind="revenue">
                      {money(d.revenueMonth)}
                    </Row>
                  )}
                  <Row label="Open tasks" kind="open_tasks" className={d.overdueTasks > 0 ? 'text-rose-600' : undefined}>
                    {d.openTasks}
                    {d.overdueTasks > 0 && ` (${d.overdueTasks} late)`}
                  </Row>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="card mb-6 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> On the clock now ({data.onTheClock.length})
          </h2>
          <Link to="/daily" className="text-sm text-brand-600">
            Daily logs →
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.onTheClock.map((c) => {
            const job = allJobs?.find((j) => j.id === c.jobId);
            return (
              <Link key={c.userId} to={`/daily/${c.userId}/${todayISO()}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <Avatar user={app.user(c.userId)} size={28} />
                <div>
                  <div className="font-medium">{app.user(c.userId)?.name}</div>
                  <div className="text-xs text-slate-500">
                    {job ? `${job.number} · ${job.title}` : 'General time'} · {hm(minutesSince(c.startedAt))}
                  </div>
                </div>
              </Link>
            );
          })}
          {!data.onTheClock.length && <p className="text-sm text-slate-400">Nobody is clocked in.</p>}
        </div>
      </section>

      <div className="mb-6 card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Job pipeline</h2>
          <Link to="/jobs" className="text-sm text-brand-600">
            Open pipeline →
          </Link>
        </div>
        <StatusBattery counts={data.jobsByStatus} meta={JOB_STATUS_META} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {Object.entries(data.jobsByStatus).map(([s, n]) => (
            <span key={s} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: JOB_STATUS_META[s as keyof typeof JOB_STATUS_META].color }} />
              {JOB_STATUS_META[s as keyof typeof JOB_STATUS_META].label} {n}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Upcoming jobs</h2>
          <div className="divide-y divide-slate-100">
            {data.upcomingJobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                <div className="w-1 self-stretch rounded" style={{ background: app.division(j.divisionId)?.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{j.title}</div>
                  <div className="text-xs text-slate-500">
                    {j.number} · {dateTime(j.scheduledStart)}
                  </div>
                </div>
                <DivisionBadge division={app.division(j.divisionId)} compact />
                <Pill label={JOB_STATUS_META[j.status].label} color={JOB_STATUS_META[j.status].color} />
                <Avatar user={app.user(j.assigneeId)} size={24} />
              </Link>
            ))}
            {!data.upcomingJobs.length && <p className="py-4 text-sm text-slate-400">Nothing scheduled.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} className="text-rose-500" /> Overdue tasks
          </h2>
          <div className="space-y-2">
            {data.overdueTasks.map((t) => (
              <Link key={t.id} to={`/boards/${t.boardId}`} className="flex items-center gap-2 rounded-md p-1.5 text-sm hover:bg-slate-50">
                <Avatar user={app.user(t.assigneeId)} size={22} />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="shrink-0 text-xs text-rose-600">{shortDate(t.dueDate)}</span>
              </Link>
            ))}
            {!data.overdueTasks.length && <p className="text-sm text-slate-400">All caught up 🎉</p>}
          </div>
        </section>

        <section className="card p-5 lg:col-span-3">
          <h2 className="mb-3 font-semibold">Recent activity</h2>
          <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            {data.recentActivity.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={clsx('truncate', a.kind === 'automation' && 'text-brand-700', a.kind === 'automation_error' && 'text-rose-600')}>
                  {a.jobId ? <Link to={`/jobs/${a.jobId}`} className="hover:underline">{a.message}</Link> : a.message}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{relative(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {drill && <DrillDown kind={drill.kind} divisionId={drill.divisionId} onClose={() => setDrill(null)} />}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  alert,
  onClick,
}: {
  icon: typeof Wrench;
  label: string;
  value: React.ReactNode;
  sub?: string;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="card group p-4 text-left transition hover:border-brand-300 hover:shadow-md">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
        <Icon size={16} /> {label}
        <ChevronRight size={16} className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className={clsx('mt-1 text-xs', alert ? 'text-rose-600' : 'text-slate-500')}>{sub}</div>}
    </button>
  );
}

import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, DollarSign, ListTodo, Wrench } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { dateTime, money, relative, shortDate } from '../format';
import { Avatar, DivisionBadge, PageHeader, Pill, StatusBattery, divisionIcon } from '../components/ui';
import { JOB_STATUS_META, type DashboardStats } from '../../shared/types';

export function Dashboard() {
  const app = useApp();
  const { data } = useApi<DashboardStats>(`/dashboard${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`);
  if (!data) return <div className="text-slate-400">Loading…</div>;

  const sum = (k: keyof DashboardStats['divisions'][number]) => data.divisions.reduce((a, d) => a + (d[k] as number), 0);
  const me = app.user(app.currentUserId);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}${me ? `, ${me.name.split(' ')[0]}` : ''}`}
        subtitle={app.divisionId ? `${app.division(app.divisionId)?.name} overview` : 'Company-wide overview across every division'}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Wrench} label="Open jobs" value={sum('openJobs')} />
        <Kpi icon={CalendarClock} label="On the schedule today" value={sum('scheduledToday')} />
        <Kpi icon={DollarSign} label="Revenue this month" value={money(sum('revenueMonth'))} sub={`${money(sum('outstanding'))} invoiced & unpaid`} />
        <Kpi icon={ListTodo} label="Open tasks" value={sum('openTasks')} sub={`${sum('overdueTasks')} overdue`} alert={sum('overdueTasks') > 0} />
      </div>

      {!app.divisionId && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.divisions.map((d) => {
            const div = app.division(d.divisionId)!;
            const Icon = divisionIcon(div.icon);
            return (
              <button key={d.divisionId} onClick={() => app.setDivisionId(div.id)} className="card border-t-4 p-4 text-left transition hover:shadow-md" style={{ borderTopColor: div.color }}>
                <div className="mb-3 flex items-center gap-2 font-semibold" style={{ color: div.color }}>
                  <Icon size={18} /> {div.name}
                </div>
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-500">Open jobs</dt>
                  <dd className="text-right font-medium">{d.openJobs}</dd>
                  <dt className="text-slate-500">Today</dt>
                  <dd className="text-right font-medium">{d.scheduledToday}</dd>
                  <dt className="text-slate-500">Revenue (mo)</dt>
                  <dd className="text-right font-medium">{money(d.revenueMonth)}</dd>
                  <dt className="text-slate-500">Open tasks</dt>
                  <dd className={clsx('text-right font-medium', d.overdueTasks > 0 && 'text-rose-600')}>
                    {d.openTasks}
                    {d.overdueTasks > 0 && ` (${d.overdueTasks} late)`}
                  </dd>
                </dl>
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-6 card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Job pipeline</h2>
          <Link to="/jobs" className="text-sm text-indigo-600">
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
                <span className={clsx('truncate', a.kind === 'automation' && 'text-indigo-700', a.kind === 'automation_error' && 'text-rose-600')}>
                  {a.jobId ? <Link to={`/jobs/${a.jobId}`} className="hover:underline">{a.message}</Link> : a.message}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{relative(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, alert }: { icon: typeof Wrench; label: string; value: React.ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
        <Icon size={16} /> {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className={clsx('mt-1 text-xs', alert ? 'text-rose-600' : 'text-slate-500')}>{sub}</div>}
    </div>
  );
}

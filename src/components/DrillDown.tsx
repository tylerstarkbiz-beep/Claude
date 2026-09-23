import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useApi } from '../api';
import { useApp } from '../store';
import { dateTime, money, shortDate, time, todayISO } from '../format';
import { Avatar, DivisionBadge, EmptyState, Modal, Pill } from './ui';
import { TaskDrawer } from './TaskDrawer';
import { marginColor } from './JobCostingCard';
import { JOB_STATUS_META, TASK_STATUS_META, type Client, type DashboardListKind, type Job, type ProfitRow, type Task } from '../../shared/types';

const TITLES: Record<DashboardListKind, string> = {
  open_jobs: 'Open jobs',
  today: 'On the schedule today',
  revenue: 'Revenue this month',
  open_tasks: 'Open tasks',
};

/** The records behind a dashboard tile: same filter as the number that was clicked. */
export function DrillDown({ kind, divisionId, onClose }: { kind: DashboardListKind; divisionId: number | null; onClose: () => void }) {
  const app = useApp();
  const { data, reload } = useApi<Job[] | ProfitRow[] | Task[]>(`/dashboard/list/${kind}${divisionId ? `?divisionId=${divisionId}` : ''}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const clientName = (id: number) => clients?.find((c) => c.id === id)?.name ?? '';
  const division = app.division(divisionId);
  const [openTask, setOpenTask] = useState<number | null>(null);

  return (
    <>
      <Modal title={`${TITLES[kind]}${division ? ` · ${division.name}` : ''}${data ? ` (${data.length})` : ''}`} onClose={onClose} wide>
        {!data ? (
          <div className="py-10 text-center text-slate-400">Loading…</div>
        ) : !data.length ? (
          <EmptyState>Nothing here right now.</EmptyState>
        ) : kind === 'revenue' ? (
          <RevenueList rows={data as ProfitRow[]} clientName={clientName} onClose={onClose} />
        ) : kind === 'open_tasks' ? (
          <TaskList tasks={data as Task[]} onOpen={setOpenTask} />
        ) : (
          <JobList jobs={data as Job[]} today={kind === 'today'} clientName={clientName} onClose={onClose} />
        )}
      </Modal>
      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </>
  );
}

function JobList({ jobs, today, clientName, onClose }: { jobs: Job[]; today: boolean; clientName: (id: number) => string; onClose: () => void }) {
  const app = useApp();
  const showMoney = app.can('view_financials');
  return (
    <div className="-mx-5 -mb-5 max-h-[65vh] overflow-auto">
      {jobs.map((j) => (
        <Link key={j.id} to={`/jobs/${j.id}`} onClick={onClose} className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 hover:bg-slate-50">
          <div className="w-1 self-stretch rounded" style={{ background: app.division(j.divisionId)?.color }} />
          <div className="w-24 shrink-0 text-xs text-slate-500">
            {today ? (
              <span className="font-semibold text-slate-700">
                {time(j.scheduledStart)}
                <br />
                <span className="font-normal">to {time(j.scheduledEnd)}</span>
              </span>
            ) : j.scheduledStart ? (
              dateTime(j.scheduledStart)
            ) : (
              <span className="text-amber-600">Unscheduled</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{j.title}</div>
            <div className="truncate text-xs text-slate-500">
              {j.number} · {clientName(j.clientId)}
              {j.address && ` · ${j.address}`}
            </div>
          </div>
          <span className="hidden sm:block">
            <DivisionBadge division={app.division(j.divisionId)} compact />
          </span>
          <Pill label={JOB_STATUS_META[j.status].label} color={JOB_STATUS_META[j.status].color} />
          <Avatar user={app.user(j.assigneeId)} size={24} />
          {showMoney && <span className="hidden w-20 text-right text-sm font-medium tabular-nums sm:block">{money(j.total)}</span>}
        </Link>
      ))}
    </div>
  );
}

function RevenueList({ rows, clientName, onClose }: { rows: ProfitRow[]; clientName: (id: number) => string; onClose: () => void }) {
  const app = useApp();
  const navigate = useNavigate();
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.laborCost + r.otherCosts }), { revenue: 0, cost: 0 });
  const profit = total.revenue - total.cost;
  const margin = total.revenue ? Math.round((profit / total.revenue) * 1000) / 10 : null;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">Jobs completed this month, by the date they were marked complete. Profit uses tracked labor and entered job costs.</p>
      <div className="-mx-5 -mb-5 max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[640px] text-sm tabular-nums">
          <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Completed</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Costs</th>
              <th className="px-3 py-2 text-right font-medium">Profit</th>
              <th className="px-5 py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.jobId} onClick={() => (onClose(), navigate(`/jobs/${r.jobId}`))} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: app.division(r.divisionId)?.color }} />
                    <span className="font-medium">{r.title}</span>
                  </div>
                  <div className="pl-4 text-xs text-slate-500">
                    {r.number} · {clientName(r.clientId)}
                  </div>
                </td>
                <td className="px-3 text-slate-600">{shortDate(r.completedAt)}</td>
                <td className="px-3 text-right font-medium">{money(r.revenue)}</td>
                <td className="px-3 text-right text-slate-600">{money(r.laborCost + r.otherCosts)}</td>
                <td className={clsx('px-3 text-right', r.profit < 0 && 'text-rose-600')}>{money(r.profit)}</td>
                <td className={clsx('px-5 text-right font-semibold', marginColor(r.margin))}>{r.margin == null ? '—' : `${r.margin}%`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-50 font-semibold">
            <tr className="border-t border-slate-200">
              <td className="px-5 py-3">Total</td>
              <td />
              <td className="px-3 text-right">{money(total.revenue)}</td>
              <td className="px-3 text-right">{money(total.cost)}</td>
              <td className={clsx('px-3 text-right', profit < 0 && 'text-rose-600')}>{money(profit)}</td>
              <td className={clsx('px-5 text-right', marginColor(margin))}>{margin == null ? '—' : `${margin}%`}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function TaskList({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: number) => void }) {
  const app = useApp();
  const today = todayISO();
  return (
    <div className="-mx-5 -mb-5 max-h-[65vh] overflow-auto">
      {tasks.map((t) => {
        const board = app.boards.find((b) => b.id === t.boardId);
        const overdue = t.dueDate && t.dueDate < today;
        return (
          <button key={t.id} onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 border-t border-slate-100 px-5 py-2.5 text-left hover:bg-slate-50">
            <Pill label={TASK_STATUS_META[t.status].label} color={TASK_STATUS_META[t.status].color} className="w-24 shrink-0 text-center" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.title}</div>
              <div className="truncate text-xs text-slate-500">
                <span style={{ color: app.division(board?.divisionId)?.color }}>{board?.name}</span>
              </div>
            </div>
            <span className={clsx('w-16 shrink-0 text-right text-xs', overdue ? 'font-medium text-rose-600' : 'text-slate-500')}>{t.dueDate ? shortDate(t.dueDate) : 'No date'}</span>
            <Avatar user={app.user(t.assigneeId)} size={24} />
          </button>
        );
      })}
    </div>
  );
}

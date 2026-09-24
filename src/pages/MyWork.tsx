import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { localDate, shortDate, time, todayISO } from '../format';
import { EmptyState, PageHeader, StatusCell } from '../components/ui';
import { TaskDrawer, statusOptions } from '../components/TaskDrawer';
import type { Job, Task } from '../../shared/types';

const BUCKETS = ['Overdue', 'Today', 'This week', 'Later', 'No date'] as const;

function bucket(due: string | null): (typeof BUCKETS)[number] {
  if (!due) return 'No date';
  const today = todayISO();
  if (due < today) return 'Overdue';
  if (due === today) return 'Today';
  const week = new Date();
  week.setDate(week.getDate() + 7);
  return due <= localDate(week) ? 'This week' : 'Later';
}

/** Everything assigned to the current user across every board and division. */
export function MyWork() {
  const app = useApp();
  const me = app.user(app.currentUserId);
  const { data: tasks, reload } = useApi<Task[]>(app.currentUserId ? `/tasks?assigneeId=${app.currentUserId}&open=1` : null);
  const { data: jobs } = useApi<Job[]>(app.currentUserId ? `/jobs?assigneeId=${app.currentUserId}` : null);
  const [openTask, setOpenTask] = useState<number | null>(null);

  const visibleTasks = (tasks ?? []).filter((t) => {
    if (!app.divisionId) return true;
    return app.boards.find((b) => b.id === t.boardId)?.divisionId === app.divisionId;
  });
  const today = todayISO();
  const todaysJobs = (jobs ?? [])
    .filter((j) => j.scheduledStart?.slice(0, 10) === today && (!app.divisionId || j.divisionId === app.divisionId))
    .sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''));

  async function setStatus(t: Task, status: Task['status']) {
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${t.id}`, { status });
    app.announce(res);
    reload();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My Work" subtitle={`Tasks and jobs assigned to ${me?.name ?? 'you'} across every board`} />

      {todaysJobs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Today's jobs</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {todaysJobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="card border-l-4 p-4 hover:shadow-md" style={{ borderLeftColor: app.division(j.divisionId)?.color }}>
                <div className="text-xs text-slate-500">
                  {time(j.scheduledStart)} – {time(j.scheduledEnd)} · {j.number}
                </div>
                <div className="font-medium">{j.title}</div>
                <div className="text-sm text-slate-500">{j.address}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!visibleTasks.length ? (
        <EmptyState>No open tasks assigned to you. Nice.</EmptyState>
      ) : (
        BUCKETS.map((b) => {
          const list = visibleTasks.filter((t) => bucket(t.dueDate) === b);
          if (!list.length) return null;
          return (
            <section key={b} className="mb-6">
              <h2 className={clsx('mb-2 text-sm font-semibold', b === 'Overdue' ? 'text-rose-600' : 'text-slate-500')}>
                {b} <span className="font-normal">({list.length})</span>
              </h2>
              <div className="card divide-y divide-slate-100">
                {list.map((t) => {
                  const board = app.boards.find((x) => x.id === t.boardId);
                  return (
                    <div key={t.id} className="flex items-center gap-3 pr-3 text-sm">
                      <div className="h-10 w-28 shrink-0">
                        <StatusCell value={t.status} options={statusOptions} onChange={(s) => setStatus(t, s)} />
                      </div>
                      <button onClick={() => setOpenTask(t.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                        {t.title}
                      </button>
                      <Link to={`/boards/${t.boardId}`} className="hidden shrink-0 text-xs text-slate-400 hover:text-brand-600 sm:block">
                        {board?.name}
                      </Link>
                      <span className={clsx('w-14 shrink-0 text-right text-xs', b === 'Overdue' ? 'text-rose-600' : 'text-slate-500')}>{shortDate(t.dueDate)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </div>
  );
}

import { Check } from 'lucide-react';
import clsx from 'clsx';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { todayISO } from '../format';
import { Checklist, ReportCard } from '../pages/DailyLogs';
import type { DailyLog, Task } from '../../shared/types';

/** My Day: checklist, tasks due, and the end-of-day report. */
export function TechDay() {
  const app = useApp();
  const today = todayISO();
  const { data: log, reload } = useApi<DailyLog>(app.currentUserId ? `/daily/${app.currentUserId}/${today}` : null);
  if (!log) return <div className="text-slate-400">Loading…</div>;

  async function done(t: Task) {
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${t.id}`, { status: 'done' });
    app.announce(res);
    reload();
  }

  return (
    <div className="space-y-5">
      <Checklist log={log} onChange={reload} large />

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Tasks due</h2>
        <div className="space-y-1">
          {log.tasksOpen.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <button onClick={() => done(t)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 border-slate-300" aria-label="Mark done">
                <Check size={16} className="text-transparent" />
              </button>
              <span className="flex-1 py-3">{t.title}</span>
              <span className={clsx('text-xs', t.dueDate && t.dueDate < today ? 'text-rose-600' : 'text-slate-400')}>{t.dueDate}</span>
            </div>
          ))}
          {!log.tasksOpen.length && <p className="text-sm text-slate-400">Nothing due. 👍</p>}
          {log.tasksCompleted.map((t) => (
            <div key={t.id} className="flex items-center gap-3 text-slate-400">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-500 text-white">
                <Check size={16} strokeWidth={3} />
              </span>
              <span className="flex-1 py-3 line-through">{t.title}</span>
            </div>
          ))}
        </div>
      </section>

      <ReportCard key={log.date} log={log} user={app.user(log.userId)} onChange={reload} large />
    </div>
  );
}

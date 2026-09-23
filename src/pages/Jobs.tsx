import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Columns3, List, Plus, Search } from 'lucide-react';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { dateTime, money } from '../format';
import { Avatar, Button, DivisionBadge, EmptyState, PageHeader, Pill } from '../components/ui';
import { JobForm } from '../components/JobForm';
import { JOB_STATUSES, JOB_STATUS_META, type Client, type Job, type JobStatus } from '../../shared/types';

export function Jobs() {
  const app = useApp();
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'pipeline'>('pipeline');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const params = new URLSearchParams();
  if (app.divisionId) params.set('divisionId', String(app.divisionId));
  if (q) params.set('q', q);
  const { data: jobs, setData, reload } = useApi<Job[]>(`/jobs?${params}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const clientName = useMemo(() => new Map(clients?.map((c) => [c.id, c.name])), [clients]);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);

  const list = (jobs ?? []).filter((j) => !status || j.status === status);

  async function move(jobId: number, to: JobStatus) {
    setData((js) => js && js.map((j) => (j.id === jobId ? { ...j, status: to } : j)));
    try {
      const res = await patch<Job & { automations?: string[] }>(`/jobs/${jobId}`, { status: to });
      app.announce(res);
    } catch (e) {
      app.toast((e as Error).message, 'error');
      reload();
    }
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${list.length} jobs${app.divisionId ? ` in ${app.division(app.divisionId)?.name}` : ' across all divisions'}`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New job
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(
            [
              ['pipeline', 'Pipeline', Columns3],
              ['list', 'List', List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', view === v ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input w-64 pl-8" placeholder="Search job #, title, client, address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'list' && (
          <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')}>
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_META[s].label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!jobs ? (
        <div className="text-slate-400">Loading…</div>
      ) : view === 'pipeline' ? (
        <div className="flex gap-3 overflow-x-auto pb-8">
          {JOB_STATUSES.filter((s) => s !== 'cancelled').map((s) => {
            const col = jobs.filter((j) => j.status === s);
            const total = col.reduce((a, j) => a + j.total, 0);
            return (
              <div
                key={s}
                className={clsx('w-64 shrink-0 rounded-lg bg-slate-100 p-2', dragOver === s && 'ring-2 ring-indigo-400')}
                onDragOver={(e) => (e.preventDefault(), setDragOver(s))}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  setDragOver(null);
                  const id = Number(e.dataTransfer.getData('text/plain'));
                  if (id && jobs.find((j) => j.id === id)?.status !== s) move(id, s);
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <Pill label={`${JOB_STATUS_META[s].label} · ${col.length}`} color={JOB_STATUS_META[s].color} />
                  <span className="text-xs text-slate-500">{money(total)}</span>
                </div>
                <div className="space-y-2">
                  {col.map((j) => (
                    <div
                      key={j.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(j.id))}
                      onClick={() => navigate(`/jobs/${j.id}`)}
                      className="cursor-pointer rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-sm hover:shadow"
                      style={{ borderLeftColor: app.division(j.divisionId)?.color }}
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono">{j.number}</span>
                        <span className="font-medium text-slate-600">{money(j.total)}</span>
                      </div>
                      <div className="text-sm font-medium leading-snug">{j.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{clientName.get(j.clientId)}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{j.scheduledStart ? dateTime(j.scheduledStart) : 'Unscheduled'}</span>
                        <Avatar user={app.user(j.assigneeId)} size={20} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : list.length === 0 ? (
        <EmptyState>No jobs match.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Division</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Tech</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/jobs/${j.id}`} className="font-medium hover:text-indigo-600">
                      {j.title}
                    </Link>
                    <div className="font-mono text-xs text-slate-400">{j.number}</div>
                  </td>
                  <td className="px-4 py-3">{clientName.get(j.clientId)}</td>
                  <td className="px-4 py-3">
                    <DivisionBadge division={app.division(j.divisionId)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{dateTime(j.scheduledStart)}</td>
                  <td className="px-4 py-3">
                    <Avatar user={app.user(j.assigneeId)} size={24} />
                  </td>
                  <td className="px-4 py-3">
                    <Pill label={JOB_STATUS_META[j.status].label} color={JOB_STATUS_META[j.status].color} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{money(j.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <JobForm onClose={() => setCreating(false)} />}
    </div>
  );
}

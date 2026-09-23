import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Mail, MapPin, Phone, Plus, Receipt, Trash2 } from 'lucide-react';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { hm, money, relative, shortDate, todayISO } from '../format';
import { Avatar, Button, CustomFieldInput, DivisionBadge, Pill, StatusCell } from '../components/ui';
import { TaskDrawer, statusOptions } from '../components/TaskDrawer';
import { NotesFeed } from '../components/NotesFeed';
import { invoiceBadge } from './Invoices';
import { JOB_STATUSES, JOB_STATUS_META, type Invoice, type InvoiceDetail, type Job, type JobDetail, type LineItem, type Task, type TimeEntry } from '../../shared/types';

type Detail = JobDetail & { activity: { id: number; message: string; createdAt: string; kind: string }[] };

const jobStatusOptions = JOB_STATUSES.map((s) => ({ value: s, ...JOB_STATUS_META[s] }));

export function JobDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const { data: job, setData, reload } = useApi<Detail>(`/jobs/${id}`);
  const [openTask, setOpenTask] = useState<number | null>(null);

  if (!job) return <div className="text-slate-400">Loading job…</div>;
  const division = app.division(job.divisionId);
  const techs = app.users.filter((u) => u.divisionIds.includes(job.divisionId));

  async function save(changes: Partial<Job>) {
    setData((j) => j && { ...j, ...changes });
    try {
      const res = await patch<Job & { automations?: string[] }>(`/jobs/${job!.id}`, changes);
      app.announce(res);
      reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
      reload();
    }
  }

  async function remove() {
    if (!confirm(`Delete ${job!.number}? This cannot be undone.`)) return;
    await del(`/jobs/${job!.id}`);
    navigate('/jobs');
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/jobs" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Jobs
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-sm text-slate-500">
            <span className="font-mono">{job.number}</span>
            <DivisionBadge division={division} />
          </div>
          <input
            key={job.title}
            defaultValue={job.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== job.title && save({ title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="-ml-1 w-full rounded px-1 text-2xl font-bold tracking-tight outline-none hover:bg-white focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 overflow-visible rounded-md">
            <StatusCell value={job.status} options={jobStatusOptions} onChange={(status) => save({ status })} className="rounded-md" />
          </div>
          <Button variant="danger" onClick={remove} title="Delete job">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <span className="label">Client</span>
                <Link to={`/clients/${job.client.id}`} className="font-medium hover:text-indigo-600">
                  {job.client.name}
                </Link>
                {job.client.company && <div className="text-sm text-slate-500">{job.client.company}</div>}
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  {job.client.phone && (
                    <a href={`tel:${job.client.phone}`} className="flex items-center gap-1.5 hover:text-indigo-600">
                      <Phone size={13} /> {job.client.phone}
                    </a>
                  )}
                  {job.client.email && (
                    <a href={`mailto:${job.client.email}`} className="flex items-center gap-1.5 hover:text-indigo-600">
                      <Mail size={13} /> {job.client.email}
                    </a>
                  )}
                </div>
              </div>
              <div>
                <span className="label">Service address</span>
                <input className="input" defaultValue={job.address ?? ''} key={job.address} onBlur={(e) => e.target.value !== (job.address ?? '') && save({ address: e.target.value })} />
                {job.address && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600"
                  >
                    <MapPin size={12} /> Directions
                  </a>
                )}
              </div>
              <div>
                <span className="label">Start</span>
                <input className="input" type="datetime-local" value={job.scheduledStart ?? ''} onChange={(e) => save({ scheduledStart: e.target.value || null })} />
              </div>
              <div>
                <span className="label">End</span>
                <input className="input" type="datetime-local" value={job.scheduledEnd ?? ''} onChange={(e) => save({ scheduledEnd: e.target.value || null })} />
              </div>
              <div>
                <span className="label">Assigned tech</span>
                <select className="input" value={job.assigneeId ?? ''} onChange={(e) => save({ assigneeId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Unassigned</option>
                  {techs.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <span className="label">Description / notes</span>
                <textarea
                  className="input"
                  rows={3}
                  defaultValue={job.description ?? ''}
                  key={job.description}
                  onBlur={(e) => e.target.value !== (job.description ?? '') && save({ description: e.target.value })}
                />
              </div>
            </div>
          </section>

          {division && division.fields.length > 0 && (
            <section className="card border-t-4 p-5" style={{ borderTopColor: division.color }}>
              <h2 className="mb-4 font-semibold">{division.name} details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {division.fields.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <span className="label">{f.label}</span>
                    <CustomFieldInput
                      field={f}
                      value={job.customFields[f.key] ?? ''}
                      onChange={(v) => {
                        const customFields = { ...job.customFields, [f.key]: v };
                        setData((j) => j && { ...j, customFields });
                        // Pickers save immediately; typed fields save when the input loses focus.
                        if (f.type === 'select' || f.type === 'date') save({ customFields });
                      }}
                      onBlur={() => save({ customFields: job.customFields })}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <LineItems job={job} onChange={reload} />

          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Notes & photos</h2>
            <NotesFeed jobId={job.id} />
          </section>
        </div>

        <div className="space-y-6">
          <JobInvoices job={job} />
          <JobTime jobId={job.id} />
          <JobTasks job={job} onOpen={setOpenTask} onChange={reload} />

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Activity</h2>
            <div className="space-y-3">
              {job.activity.map((a) => (
                <div key={a.id} className="text-sm">
                  <div className={clsx(a.kind === 'automation' && 'text-indigo-700', a.kind === 'automation_error' && 'text-rose-600')}>{a.message}</div>
                  <div className="text-xs text-slate-400">{relative(a.createdAt)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </div>
  );
}

function LineItems({ job, onChange }: { job: Detail; onChange: () => void }) {
  const [draft, setDraft] = useState({ description: '', quantity: '1', unitPrice: '' });

  async function add() {
    if (!draft.description.trim()) return;
    await post(`/jobs/${job.id}/line-items`, draft);
    setDraft({ description: '', quantity: '1', unitPrice: '' });
    onChange();
  }

  async function edit(li: LineItem, changes: Partial<LineItem>) {
    await patch(`/line-items/${li.id}`, changes);
    onChange();
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 font-semibold">Line items</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-2">Description</th>
              <th className="w-20 pb-2">Qty</th>
              <th className="w-28 pb-2">Unit price</th>
              <th className="w-28 pb-2 text-right">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {job.lineItems.map((li) => (
              <tr key={li.id} className="group border-t border-slate-100">
                <td className="py-1.5 pr-2">
                  <input className="w-full rounded px-1 py-1 outline-none hover:bg-slate-50 focus:bg-slate-50" defaultValue={li.description} onBlur={(e) => e.target.value !== li.description && edit(li, { description: e.target.value })} />
                </td>
                <td className="pr-2">
                  <input type="number" step="any" className="w-full rounded px-1 py-1 outline-none hover:bg-slate-50 focus:bg-slate-50" defaultValue={li.quantity} onBlur={(e) => Number(e.target.value) !== li.quantity && edit(li, { quantity: Number(e.target.value) })} />
                </td>
                <td className="pr-2">
                  <input type="number" step="any" className="w-full rounded px-1 py-1 outline-none hover:bg-slate-50 focus:bg-slate-50" defaultValue={li.unitPrice} onBlur={(e) => Number(e.target.value) !== li.unitPrice && edit(li, { unitPrice: Number(e.target.value) })} />
                </td>
                <td className="text-right font-medium">{money(li.quantity * li.unitPrice)}</td>
                <td className="text-right">
                  <button className="invisible text-slate-400 hover:text-rose-600 group-hover:visible" onClick={async () => (await del(`/line-items/${li.id}`), onChange())}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-100">
              <td className="py-2 pr-2">
                <input className="input" placeholder="Add line item…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
              </td>
              <td className="pr-2">
                <input className="input" type="number" step="any" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
              </td>
              <td className="pr-2">
                <input className="input" type="number" step="any" placeholder="0.00" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
              </td>
              <td colSpan={2} className="text-right">
                <Button variant="secondary" onClick={add}>
                  <Plus size={15} />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end border-t border-slate-200 pt-4 text-lg font-semibold">Total {money(job.total)}</div>
    </section>
  );
}

function JobTasks({ job, onOpen, onChange }: { job: Detail; onOpen: (id: number) => void; onChange: () => void }) {
  const app = useApp();
  const divisionBoards = app.boards.filter((b) => b.divisionId === job.divisionId);
  const [boardId, setBoardId] = useState<number | ''>(divisionBoards[0]?.id ?? app.boards[0]?.id ?? '');
  const [title, setTitle] = useState('');

  async function add() {
    if (!title.trim() || !boardId) return;
    await post('/tasks', { boardId, title, jobId: job.id, assigneeId: job.assigneeId });
    setTitle('');
    onChange();
  }

  async function setStatus(t: Task, status: Task['status']) {
    const res = await patch<Task & { automations?: string[] }>(`/tasks/${t.id}`, { status });
    app.announce(res);
    onChange();
  }

  const done = job.tasks.filter((t) => t.status === 'done').length;

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Tasks</h2>
        <span className="text-xs text-slate-500">
          {done}/{job.tasks.length} done
        </span>
      </div>
      {job.tasks.length > 0 && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / job.tasks.length) * 100}%` }} />
        </div>
      )}
      <div className="space-y-1.5">
        {job.tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md border border-slate-200 text-sm">
            <div className="h-8 w-24 shrink-0 overflow-visible">
              <StatusCell value={t.status} options={statusOptions} onChange={(s) => setStatus(t, s)} className="rounded-l-md" />
            </div>
            <button onClick={() => onOpen(t.id)} className={clsx('min-w-0 flex-1 truncate text-left hover:underline', t.status === 'done' && 'text-slate-400 line-through')}>
              {t.title}
            </button>
            {t.dueDate && <span className={clsx('shrink-0 text-xs', t.status !== 'done' && t.dueDate < todayISO() ? 'text-rose-600' : 'text-slate-400')}>{shortDate(t.dueDate)}</span>}
            <span className="mr-2 shrink-0">
              <Avatar user={app.user(t.assigneeId)} size={22} />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <input className="input" placeholder="Add a task for this job…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <div className="flex gap-2">
          <select className="input" value={boardId} onChange={(e) => setBoardId(Number(e.target.value))}>
            {app.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button onClick={add}>
            <Plus size={15} /> Add
          </Button>
        </div>
      </div>
    </section>
  );
}

function JobInvoices({ job }: { job: Detail }) {
  const app = useApp();
  const navigate = useNavigate();
  const { data: invoices } = useApi<Invoice[]>(`/invoices?jobId=${job.id}`);
  const open = invoices?.filter((i) => i.status !== 'void') ?? [];

  async function create() {
    if (open.length && !confirm('This job already has an invoice. Create another one?')) return;
    try {
      const inv = await post<InvoiceDetail>('/invoices', { jobId: job.id });
      navigate(`/invoices/${inv.id}`);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Invoicing</h2>
        <Button variant={open.length ? 'secondary' : 'primary'} onClick={create}>
          <Receipt size={15} /> Create invoice
        </Button>
      </div>
      {invoices?.map((i) => {
        const b = invoiceBadge(i);
        return (
          <Link key={i.id} to={`/invoices/${i.id}`} className="flex items-center gap-2 rounded-md py-1.5 text-sm hover:bg-slate-50">
            <span className="font-mono font-medium">{i.number}</span>
            <Pill label={b.label} color={b.color} />
            <span className="ml-auto">{i.balance > 0 ? `${money(i.balance)} due` : money(i.total)}</span>
          </Link>
        );
      })}
      {invoices && !invoices.length && (
        <p className="text-sm text-slate-500">
          {['completed'].includes(job.status) ? 'Job is complete and ready to invoice.' : 'No invoices yet.'}
        </p>
      )}
    </section>
  );
}

function JobTime({ jobId }: { jobId: number }) {
  const app = useApp();
  const { data: entries } = useApi<TimeEntry[]>(`/time?jobId=${jobId}`);
  if (!entries) return null;
  const mins = (e: TimeEntry) => Math.round(((e.endedAt ? new Date(e.endedAt) : new Date()).getTime() - new Date(e.startedAt).getTime()) / 60000);
  const byUser = new Map<number, number>();
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + mins(e));
  const total = [...byUser.values()].reduce((a, b) => a + b, 0);
  const days = [...new Set(entries.map((e) => e.startedAt.slice(0, 10)))];

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Labor</h2>
        <span className="text-sm font-semibold">{hm(total)}</span>
      </div>
      {!entries.length && <p className="text-sm text-slate-500">No time tracked on this job yet.</p>}
      {[...byUser].map(([userId, m]) => (
        <div key={userId} className="flex items-center gap-2 py-1 text-sm">
          <Avatar user={app.user(userId)} size={22} />
          <span className="flex-1">{app.user(userId)?.name}</span>
          {entries.some((e) => e.userId === userId && !e.endedAt) && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="On this job now" />}
          <span className="font-medium">{hm(m)}</span>
        </div>
      ))}
      {days.length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          Across {days.length} day{days.length > 1 ? 's' : ''}:{' '}
          {days.map((d, i) => (
            <span key={d}>
              {i > 0 && ', '}
              {shortDate(d)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

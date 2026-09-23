import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { dateTime, money } from '../format';
import { Button, DivisionBadge, Pill } from '../components/ui';
import { JobForm } from '../components/JobForm';
import { JOB_STATUS_META, type Client, type Job } from '../../shared/types';

export function ClientDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const { data: client, reload } = useApi<Client & { jobs: Job[] }>(`/clients/${id}`);
  const [creating, setCreating] = useState(false);
  if (!client) return <div className="text-slate-400">Loading…</div>;

  const lifetime = client.jobs.filter((j) => ['completed', 'invoiced', 'paid'].includes(j.status)).reduce((a, j) => a + j.total, 0);
  const save = async (changes: Partial<Client>) => {
    await patch(`/clients/${client.id}`, changes);
    reload();
  };
  const field = (k: keyof Client, label: string) => (
    <div>
      <span className="label">{label}</span>
      <input
        className="input"
        key={String(client[k])}
        defaultValue={(client[k] as string) ?? ''}
        onBlur={(e) => e.target.value !== (client[k] ?? '') && save({ [k]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Clients
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {client.jobs.length} jobs · {money(lifetime)} lifetime revenue
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New job for client
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="card space-y-3 p-5">
          {field('name', 'Name')}
          {field('company', 'Company')}
          {field('phone', 'Phone')}
          {field('email', 'Email')}
          {field('address', 'Address')}
          <div>
            <span className="label">Notes</span>
            <textarea
              className="input"
              rows={4}
              key={client.notes}
              defaultValue={client.notes ?? ''}
              onBlur={(e) => e.target.value !== (client.notes ?? '') && save({ notes: e.target.value })}
            />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Job history (all divisions)</h2>
          <div className="divide-y divide-slate-100">
            {client.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{j.title}</div>
                  <div className="text-xs text-slate-500">
                    {j.number} · {dateTime(j.scheduledStart)}
                  </div>
                </div>
                <DivisionBadge division={app.division(j.divisionId)} />
                <Pill label={JOB_STATUS_META[j.status].label} color={JOB_STATUS_META[j.status].color} />
                <span className="w-20 text-right text-sm font-medium">{money(j.total)}</span>
              </Link>
            ))}
            {!client.jobs.length && <p className="py-4 text-sm text-slate-400">No jobs yet.</p>}
          </div>
        </section>
      </div>
      {creating && <JobForm onClose={() => setCreating(false)} clientId={client.id} />}
    </div>
  );
}

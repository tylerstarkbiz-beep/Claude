import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post, useApi } from '../api';
import { useApp } from '../store';
import { Button, CustomFieldInput, Modal } from './ui';
import { JOB_STATUSES, JOB_STATUS_META, type Client, type Job, type JobStatus } from '../../shared/types';

export function JobForm({ onClose, clientId, divisionId }: { onClose: () => void; clientId?: number; divisionId?: number | null }) {
  const app = useApp();
  const navigate = useNavigate();
  const { data: clients, reload: reloadClients } = useApi<Client[]>('/clients');
  const [form, setForm] = useState({
    divisionId: divisionId ?? app.divisionId ?? app.divisions[0]?.id,
    clientId: clientId ?? ('' as number | ''),
    title: '',
    description: '',
    status: 'request' as JobStatus,
    scheduledStart: '',
    scheduledEnd: '',
    assigneeId: '' as number | '',
    customFields: {} as Record<string, string>,
  });
  const [newClient, setNewClient] = useState<{ name: string; phone: string; email: string; address: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const division = app.division(form.divisionId);
  const techs = app.users.filter((u) => !division || u.divisionIds.includes(division.id));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let cid = form.clientId;
      if (newClient) {
        const c = await post<Client>('/clients', newClient);
        cid = c.id;
        reloadClients();
      }
      const job = await post<Job & { automations?: string[] }>('/jobs', {
        ...form,
        clientId: cid,
        assigneeId: form.assigneeId || null,
        status: form.scheduledStart && form.status === 'request' ? 'scheduled' : form.status,
      });
      app.toast(`Created ${job.number}`);
      app.announce(job);
      onClose();
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      app.toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New job" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="label">Division</span>
          <div className="flex flex-wrap gap-2">
            {app.divisions.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => setForm((f) => ({ ...f, divisionId: d.id, customFields: {}, assigneeId: '' }))}
                className="rounded-full border px-3 py-1.5 text-sm font-medium"
                style={form.divisionId === d.id ? { background: d.color, borderColor: d.color, color: 'white' } : { borderColor: '#cbd5e1' }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Client</span>
            {newClient ? (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <input className="input" required placeholder="Name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                <input className="input" placeholder="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                <input className="input" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                <input className="input" placeholder="Address" value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
                <button type="button" className="text-xs text-indigo-600" onClick={() => setNewClient(null)}>
                  Choose existing client instead
                </button>
              </div>
            ) : (
              <>
                <select className="input" required value={form.clientId} onChange={(e) => set('clientId', Number(e.target.value))}>
                  <option value="">Select a client…</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="mt-1 text-xs text-indigo-600" onClick={() => setNewClient({ name: '', phone: '', email: '', address: '' })}>
                  + New client
                </button>
              </>
            )}
          </div>
          <div>
            <span className="label">Job title</span>
            <input className="input" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Water mitigation — kitchen" />
          </div>
          <div>
            <span className="label">Start</span>
            <input className="input" type="datetime-local" value={form.scheduledStart} onChange={(e) => set('scheduledStart', e.target.value)} />
          </div>
          <div>
            <span className="label">End</span>
            <input className="input" type="datetime-local" value={form.scheduledEnd} onChange={(e) => set('scheduledEnd', e.target.value)} />
          </div>
          <div>
            <span className="label">Assigned to</span>
            <select className="input" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value ? Number(e.target.value) : '')}>
              <option value="">Unassigned</option>
              {techs.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Status</span>
            <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as JobStatus)}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {division && division.fields.length > 0 && (
          <div className="rounded-lg p-4" style={{ background: division.color + '10' }}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: division.color }}>
              {division.name} details
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {division.fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <span className="label">{f.label}</span>
                  <CustomFieldInput field={f} value={form.customFields[f.key] ?? ''} onChange={(v) => set('customFields', { ...form.customFields, [f.key]: v })} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="label">Description</span>
          <textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving}>{saving ? 'Saving…' : 'Create job'}</Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { post, useApi } from '../api';
import { useApp } from '../store';
import { Button, DivisionBadge, EmptyState, Modal, PageHeader } from '../components/ui';
import type { Client } from '../../shared/types';

type ClientRow = Client & { jobCount: number; openJobs: number; divisionIds: number[] };

export function Clients() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data } = useApi<ClientRow[]>(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const clients = (data ?? []).filter((c) => !app.divisionId || c.divisionIds.includes(app.divisionId));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clients"
        subtitle="One customer record shared by every division"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New client
          </Button>
        }
      />
      <div className="relative mb-4 w-72">
        <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input className="input pl-8" placeholder="Search name, company, phone, address" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {!clients.length ? (
        <EmptyState>No clients found.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Divisions served</th>
                <th className="px-4 py-3 text-right">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/clients/${c.id}`} className="font-medium hover:text-brand-600">
                      {c.name}
                    </Link>
                    {c.company && <div className="text-xs text-slate-500">{c.company}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{c.phone}</div>
                    <div className="text-xs">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.address}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.divisionIds.map((d) => (
                        <DivisionBadge key={d} division={app.division(d)} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.jobCount}
                    {c.openJobs > 0 && <span className="text-xs text-slate-500"> ({c.openJobs} open)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <ClientForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function ClientForm({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', address: '', notes: '' });
  const field = (k: keyof typeof form, label: string, type = 'text') => (
    <div>
      <span className="label">{label}</span>
      <input className="input" type={type} required={k === 'name'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );
  return (
    <Modal title="New client" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const c = await post<Client>('/clients', form);
            navigate(`/clients/${c.id}`);
          } catch (err) {
            app.toast((err as Error).message, 'error');
          }
        }}
      >
        {field('name', 'Name')}
        {field('company', 'Company (optional)')}
        <div className="grid grid-cols-2 gap-3">
          {field('phone', 'Phone', 'tel')}
          {field('email', 'Email', 'email')}
        </div>
        {field('address', 'Address')}
        <div>
          <span className="label">Notes</span>
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Create client</Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { Avatar, Button, PageHeader } from '../components/ui';
import type { ChecklistTemplate, CompanySettings, Division, FieldDef, FieldType, User } from '../../shared/types';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'select', 'date', 'textarea'];

export function SettingsPage() {
  const app = useApp();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Company info, divisions, daily checklists and team" />
      <CompanyEditor />
      <ChecklistTemplates />
      <h2 className="mb-3 font-semibold">Divisions</h2>
      <div className="mb-10 space-y-4">
        {app.divisions.map((d) => (
          <DivisionEditor key={d.id} division={d} />
        ))}
      </div>
      <Team />
    </div>
  );
}

function DivisionEditor({ division }: { division: Division }) {
  const app = useApp();
  const [d, setD] = useState(division);
  const dirty = JSON.stringify(d) !== JSON.stringify(division);

  const setField = (i: number, changes: Partial<FieldDef>) => setD({ ...d, fields: d.fields.map((f, k) => (k === i ? { ...f, ...changes } : f)) });

  async function save() {
    // Drop blank rows and derive keys for new fields from their labels.
    const fields = d.fields.filter((f) => f.label.trim()).map((f) => ({ ...f, key: f.key || slug(f.label) }));
    setD({ ...d, fields });
    try {
      await patch(`/divisions/${d.id}`, { name: d.name, color: d.color, prefix: d.prefix, fields });
      await app.reload();
      app.toast(`${d.name} saved`);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="card border-l-4 p-5" style={{ borderLeftColor: d.color }}>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_120px_80px]">
        <div>
          <span className="label">Name</span>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div>
          <span className="label">Job # prefix</span>
          <input className="input uppercase" maxLength={5} value={d.prefix} onChange={(e) => setD({ ...d, prefix: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <span className="label">Color</span>
          <input type="color" className="h-9 w-full cursor-pointer rounded border border-slate-300" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
        </div>
      </div>

      <span className="label">Custom job fields</span>
      <div className="space-y-2">
        {d.fields.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_1fr_32px] gap-2">
            <input
              className="input"
              placeholder="Label"
              value={f.label}
              onChange={(e) => setField(i, { label: e.target.value })}
            />
            <select className="input" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
              {FIELD_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {f.type === 'select' ? (
              <input
                className="input"
                placeholder="Options, comma separated"
                value={f.options?.join(', ') ?? ''}
                onChange={(e) => setField(i, { options: e.target.value.split(',').map((s) => s.trim()) })}
              />
            ) : (
              <div />
            )}
            <button className="text-slate-400 hover:text-rose-600" onClick={() => setD({ ...d, fields: d.fields.filter((_, k) => k !== i) })}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between">
        <Button variant="ghost" onClick={() => setD({ ...d, fields: [...d.fields, { key: '', label: '', type: 'text' }] })}>
          <Plus size={15} /> Add field
        </Button>
        <Button disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^[^a-z]+/, '');

function Team() {
  const app = useApp();
  const [form, setForm] = useState({ name: '', email: '', role: 'technician' as User['role'], divisionIds: [] as number[] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const colors = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#0086c0', '#ff7575'];
      await post('/users', { ...form, color: colors[app.users.length % colors.length] });
      setForm({ name: '', email: '', role: 'technician', divisionIds: [] });
      app.reload();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  return (
    <>
      <h2 className="mb-3 font-semibold">Team</h2>
      <div className="card mb-4 divide-y divide-slate-100">
        {app.users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <Avatar user={u} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <span className="text-xs capitalize text-slate-500">{u.role}</span>
            <div className="flex gap-1">
              {u.divisionIds.map((id) => {
                const d = app.division(id);
                return d && <span key={id} className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} title={d.name} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="card grid gap-3 p-4 sm:grid-cols-2">
        <input className="input" required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}>
          <option value="technician">Technician</option>
          <option value="manager">Manager</option>
          <option value="office">Office</option>
          <option value="owner">Owner</option>
        </select>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {app.divisions.map((d) => (
            <label key={d.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={form.divisionIds.includes(d.id)}
                onChange={(e) =>
                  setForm({ ...form, divisionIds: e.target.checked ? [...form.divisionIds, d.id] : form.divisionIds.filter((x) => x !== d.id) })
                }
              />
              {d.name}
            </label>
          ))}
        </div>
        <div className="sm:col-span-2">
          <Button>
            <Plus size={15} /> Add team member
          </Button>
        </div>
      </form>
    </>
  );
}

function CompanyEditor() {
  const app = useApp();
  const { data, setData } = useApi<CompanySettings>('/settings/company');
  if (!data) return null;
  const field = (k: keyof CompanySettings, label: string, type = 'text') => (
    <div>
      <span className="label">{label}</span>
      <input className="input" type={type} value={String(data[k])} onChange={(e) => setData({ ...data, [k]: type === 'number' ? Number(e.target.value) : e.target.value })} />
    </div>
  );
  return (
    <>
      <h2 className="mb-3 font-semibold">Company (shown on invoices)</h2>
      <form
        className="card mb-10 grid gap-3 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setData(await api<CompanySettings>('/settings/company', { method: 'PUT', body: data }));
          app.toast('Company settings saved');
        }}
      >
        {field('name', 'Business name')}
        {field('phone', 'Phone')}
        {field('email', 'Email', 'email')}
        {field('address', 'Address')}
        {field('paymentTermsDays', 'Payment terms (days until due)', 'number')}
        {field('defaultTaxRate', 'Default tax %', 'number')}
        <div className="sm:col-span-2">
          <span className="label">Invoice footer</span>
          <textarea className="input" rows={2} value={data.invoiceFooter} onChange={(e) => setData({ ...data, invoiceFooter: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Button>Save</Button>
        </div>
      </form>
    </>
  );
}

const ROLES: User['role'][] = ['owner', 'manager', 'technician', 'office'];

function ChecklistTemplates() {
  const app = useApp();
  const { data, reload } = useApi<ChecklistTemplate[]>('/checklist-templates');
  const [form, setForm] = useState({ title: '', role: '', divisionId: '', userId: '' });

  const scope = (t: ChecklistTemplate) =>
    [
      t.userId ? app.user(t.userId)?.name : null,
      t.role ? `${t.role}s` : null,
      t.divisionId ? app.division(t.divisionId)?.name : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Everyone';

  return (
    <>
      <h2 className="mb-1 font-semibold">Daily checklists</h2>
      <p className="mb-3 text-sm text-slate-500">These items appear on each matching employee's daily log every day. Target by role, division, or one person.</p>
      <div className="card mb-3 divide-y divide-slate-100">
        {data?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <input type="checkbox" checked={t.active} onChange={async () => (await patch(`/checklist-templates/${t.id}`, { active: !t.active }), reload())} title="Active" />
            <span className={t.active ? 'flex-1' : 'flex-1 text-slate-400 line-through'}>{t.title}</span>
            <span className="text-xs capitalize text-slate-500">{scope(t)}</span>
            <button className="text-slate-400 hover:text-rose-600" onClick={async () => confirm('Remove this checklist item?') && (await del(`/checklist-templates/${t.id}`), reload())}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="card mb-10 grid gap-2 p-4 sm:grid-cols-[1fr_130px_150px_150px_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          await post('/checklist-templates', form);
          setForm({ title: '', role: '', divisionId: '', userId: '' });
          reload();
        }}
      >
        <input className="input" required placeholder="e.g. Pre-trip vehicle inspection" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="">Any role</option>
          {ROLES.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </select>
        <select className="input" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: e.target.value })}>
          <option value="">Any division</option>
          {app.divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="input" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
          <option value="">Anyone</option>
          {app.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <Button>
          <Plus size={15} /> Add
        </Button>
      </form>
    </>
  );
}

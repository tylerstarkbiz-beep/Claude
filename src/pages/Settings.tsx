import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { patch, post } from '../api';
import { useApp } from '../store';
import { Avatar, Button, PageHeader } from '../components/ui';
import type { Division, FieldDef, FieldType, User } from '../../shared/types';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'select', 'date', 'textarea'];

export function SettingsPage() {
  const app = useApp();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Divisions, custom job fields and team members" />
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

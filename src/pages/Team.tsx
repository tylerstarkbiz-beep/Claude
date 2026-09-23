import { useState } from 'react';
import clsx from 'clsx';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { patch, post } from '../api';
import { useApp } from '../store';
import { money } from '../format';
import { Avatar, Button, Drawer, PageHeader } from '../components/ui';
import { PERMISSIONS, PERMISSION_META, ROLE_DEFAULTS, type Permission, type Role, type User } from '../../shared/types';

const ROLES: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'office', label: 'Office' },
  { value: 'technician', label: 'Technician' },
];
const COLORS = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#0086c0', '#ff7575', '#401694', '#037f4c', '#bb3354'];

type Draft = Omit<User, 'id'> & { id?: number };

const blank = (): Draft => ({
  name: '',
  email: '',
  phone: '',
  role: 'technician',
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  divisionIds: [],
  hourlyRate: 0,
  permissions: [...ROLE_DEFAULTS.technician],
  active: true,
});

/** Team members, their hourly cost, and what they're allowed to do. */
export function Team() {
  const app = useApp();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const members = app.users.filter((u) => showInactive || u.active);
  const inactive = app.users.filter((u) => !u.active).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Team"
        subtitle="Hourly cost drives labor cost on every job. Permissions control what each person can see and do."
        actions={
          <Button onClick={() => setEditing(blank())}>
            <Plus size={16} /> Add member
          </Button>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Divisions</th>
              <th className="px-4 py-3 text-right">Hourly cost</th>
              <th className="px-4 py-3">Permissions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id} onClick={() => setEditing(u)} className={clsx('cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50', !u.active && 'opacity-50')}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar user={u} size={32} />
                    <div>
                      <div className="font-medium">
                        {u.name} {!u.active && <span className="text-xs font-normal text-slate-500">(inactive)</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {u.email}
                        {u.phone && ` · ${u.phone}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">{u.role}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.divisionIds.map((id) => {
                      const d = app.division(id);
                      return (
                        d && (
                          <span key={id} className="rounded-full px-2 py-0.5 text-xs" style={{ background: d.color + '1f', color: d.color }}>
                            {d.name}
                          </span>
                        )
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{u.hourlyRate ? `${money(u.hourlyRate)}/hr` : <span className="text-amber-600">Not set</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.permissions.length === PERMISSIONS.length ? (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">Full access</span>
                    ) : u.permissions.length ? (
                      u.permissions.map((p) => (
                        <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {PERMISSION_META[p].label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">Field work only</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inactive > 0 && (
        <button className="mt-3 text-sm text-indigo-600" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? 'Hide' : 'Show'} {inactive} inactive member{inactive > 1 ? 's' : ''}
        </button>
      )}
      <p className="mt-4 max-w-2xl text-xs text-slate-500">
        Use each person's <b>loaded</b> hourly cost: wage plus payroll taxes, workers' comp and benefits (often 20–35% above the wage). A rate
        change applies to time worked from now on; past jobs keep the rate that was in effect.
      </p>

      {editing && <MemberDrawer member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberDrawer({ member, onClose }: { member: Draft; onClose: () => void }) {
  const app = useApp();
  const [d, setD] = useState<Draft>({ ...member, phone: member.phone ?? '' });
  const [saving, setSaving] = useState(false);
  const isNew = !member.id;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const togglePerm = (p: Permission) => set('permissions', d.permissions.includes(p) ? d.permissions.filter((x) => x !== p) : [...d.permissions, p]);
  const matchesRole = [...d.permissions].sort().join() === [...ROLE_DEFAULTS[d.role]].sort().join();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...d, hourlyRate: Number(d.hourlyRate) || 0 };
      if (isNew) await post('/users', body);
      else await patch(`/users/${member.id}`, body);
      await app.reload();
      app.toast(isNew ? `${d.name} added to the team` : `${d.name} saved`);
      onClose();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer onClose={onClose}>
      <form onSubmit={save} className="flex min-h-full flex-col">
        <div className="flex items-center gap-3 border-b border-slate-200 p-5">
          <Avatar user={{ ...(d as User), id: d.id ?? 0, name: d.name || '?' }} size={40} />
          <h2 className="text-lg font-semibold">{isNew ? 'Add team member' : d.name}</h2>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Name</span>
              <input id="member-name" className="input" required value={d.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label>
              <span className="label">Email</span>
              <input id="member-email" className="input" type="email" required value={d.email} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label>
              <span className="label">Phone</span>
              <input id="member-phone" className="input" type="tel" value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </label>
            <label>
              <span className="label">Hourly cost ($/hr, loaded)</span>
              <input
                id="member-rate"
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={d.hourlyRate}
                onChange={(e) => set('hourlyRate', e.target.value as unknown as number)}
              />
            </label>
          </div>

          <div>
            <span className="label">Role</span>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => setD((cur) => ({ ...cur, role: r.value, permissions: [...ROLE_DEFAULTS[r.value]] }))}
                  className={clsx('rounded-full border px-3 py-1.5 text-sm', d.role === r.value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300')}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Picking a role fills in its usual permissions. You can adjust them below.</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">Permissions</span>
              {!matchesRole && (
                <button type="button" className="flex items-center gap-1 text-xs text-indigo-600" onClick={() => set('permissions', [...ROLE_DEFAULTS[d.role]])}>
                  <RotateCcw size={12} /> Reset to {d.role} defaults
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {PERMISSIONS.map((p) => {
                const on = d.permissions.includes(p);
                return (
                  <button type="button" key={p} onClick={() => togglePerm(p)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <span
                      className={clsx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border-2', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300')}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{PERMISSION_META[p].label}</span>
                      <span className="block text-xs text-slate-500">{PERMISSION_META[p].description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Everyone can clock in, work their jobs, add notes and photos, and fill in their daily log.</p>
          </div>

          <div>
            <span className="label">Divisions</span>
            <div className="flex flex-wrap gap-2">
              {app.divisions.map((div) => {
                const on = d.divisionIds.includes(div.id);
                return (
                  <button
                    type="button"
                    key={div.id}
                    onClick={() => set('divisionIds', on ? d.divisionIds.filter((x) => x !== div.id) : [...d.divisionIds, div.id])}
                    className="rounded-full border px-3 py-1.5 text-sm"
                    style={on ? { background: div.color, borderColor: div.color, color: 'white' } : { borderColor: '#cbd5e1' }}
                  >
                    {div.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="label">Color</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => set('color', c)}
                  className={clsx('h-7 w-7 rounded-full', d.color === c && 'ring-2 ring-slate-800 ring-offset-2')}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          {!isNew && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
              Active. Turn off when someone leaves: their history stays, and they drop out of schedules and pickers.
            </label>
          )}
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-slate-200 p-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving}>{isNew ? 'Add member' : 'Save'}</Button>
        </div>
      </form>
    </Drawer>
  );
}

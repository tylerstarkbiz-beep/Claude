import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Upload } from 'lucide-react';
import { api, del, patch, post, useApi } from '../api';
import { resizeImage } from '../photos';
import { relative } from '../format';
import { DEFAULT_BRAND, DEFAULT_LOGO } from '../../shared/brand';
import { useApp } from '../store';
import { Button, PageHeader } from '../components/ui';
import type { ChecklistTemplate, CompanySettings, Division, FieldDef, FieldType, User } from '../../shared/types';

const FIELD_TYPES: FieldType[] = ['text', 'number', 'select', 'date', 'textarea'];

export function SettingsPage() {
  const app = useApp();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Company info, daily checklists and divisions" />
      <CompanyEditor />
      <ChecklistTemplates />
      <Outbox />
      <h2 className="mb-3 font-semibold">Divisions</h2>
      <div className="mb-10 space-y-4">
        {app.divisions.map((d) => (
          <DivisionEditor key={d.id} division={d} />
        ))}
      </div>
      <h2 className="mb-2 font-semibold">Team</h2>
      <p className="mb-10 text-sm text-slate-500">
        Team members, hourly costs and permissions are managed on the{' '}
        <Link to="/team" className="text-brand-600 hover:underline">
          Team page
        </Link>
        .
      </p>
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

function CompanyEditor() {
  const app = useApp();
  const { data, setData } = useApi<CompanySettings>('/settings/company');
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview colors live while editing; put the saved colors back when leaving without saving.
  useEffect(() => {
    if (!data) return;
    document.documentElement.style.setProperty('--brand', data.brandColor);
    document.documentElement.style.setProperty('--accent', data.accentColor);
  }, [data?.brandColor, data?.accentColor]);
  useEffect(
    () => () => {
      document.documentElement.style.setProperty('--brand', app.company.brandColor);
      document.documentElement.style.setProperty('--accent', app.company.accentColor);
    },
    [app.company],
  );

  if (!data) return null;
  const field = (k: keyof CompanySettings, label: string, type = 'text') => (
    <div>
      <span className="label">{label}</span>
      <input
        id={`company-${k}`}
        className="input"
        type={type}
        value={String(data[k] ?? '')}
        onChange={(e) => setData({ ...data, [k]: type === 'number' ? Number(e.target.value) : e.target.value })}
      />
    </div>
  );
  const color = (k: 'brandColor' | 'accentColor', label: string, hint: string) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          value={data[k]}
          onChange={(e) => setData({ ...data, [k]: e.target.value })}
        />
        <input
          id={`company-${k}`}
          className="input w-28 font-mono uppercase"
          value={data[k]}
          maxLength={7}
          onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setData({ ...data, [k]: e.target.value })}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );

  async function pickLogo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      // PNG keeps transparent backgrounds; 800px is plenty for the app and invoices.
      setData({ ...data!, logo: await resizeImage(file, 800, 0.92, 'image/png') });
    } catch {
      app.toast('Could not read that image', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <h2 className="mb-3 font-semibold">Company & branding</h2>
      <form
        className="card mb-10 grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setData(await api<CompanySettings>('/settings/company', { method: 'PUT', body: data }));
            await app.reload();
            app.toast('Company settings saved');
          } catch (err) {
            app.toast((err as Error).message, 'error');
          }
        }}
      >
        <div className="sm:col-span-2">
          <span className="label">Logo (shown in the app, the tech app and on invoices)</span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-28 w-40 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
              {data.logo ? <img src={data.logo} alt="Company logo" className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">No logo</span>}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickLogo(e.target.files)} />
              <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Upload logo
              </Button>
              {data.logo && data.logo !== DEFAULT_LOGO && (
                <Button type="button" variant="ghost" onClick={() => setData({ ...data, logo: DEFAULT_LOGO })}>
                  Use the Big Country logo
                </Button>
              )}
              {data.logo && (
                <Button type="button" variant="danger" onClick={() => setData({ ...data, logo: null })}>
                  Remove logo
                </Button>
              )}
            </div>
            <p className="max-w-xs text-xs text-slate-500">A PNG with a transparent background looks best. Wide or square logos both work.</p>
          </div>
        </div>

        {color('brandColor', 'Brand color', 'Buttons, links, highlights and the tech app header.')}
        {color('accentColor', 'Accent color', 'Small highlights, like the selected menu item.')}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <span className="text-xs text-slate-500">Preview:</span>
          <span className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">Button</span>
          <span className="rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">Selected</span>
          <span className="text-sm font-medium text-brand-600 underline">Link</span>
          <span className="h-5 w-1 rounded-full bg-accent-500" />
          <span className="text-xs font-semibold uppercase tracking-widest text-accent-500">Accent</span>
          {(data.brandColor !== DEFAULT_BRAND.brandColor || data.accentColor !== DEFAULT_BRAND.accentColor) && (
            <button type="button" className="ml-2 text-xs text-brand-600 hover:underline" onClick={() => setData({ ...data, ...DEFAULT_BRAND })}>
              Reset to logo colors
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 sm:col-span-2" />
        {field('name', 'Business name')}
        {field('phone', 'Phone')}
        {field('email', 'Email', 'email')}
        {field('address', 'Address')}
        {field('paymentTermsDays', 'Payment terms (days until due)', 'number')}
        {field('defaultTaxRate', 'Default tax %', 'number')}
        <div className="sm:col-span-2">
          <span className="label">Invoice footer</span>
          <textarea id="company-footer" className="input" rows={2} value={data.invoiceFooter} onChange={(e) => setData({ ...data, invoiceFooter: e.target.value })} />
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

interface OutboxEntry {
  id: number;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  status: 'queued' | 'sent' | 'failed' | 'not_configured';
  error: string | null;
  createdAt: string;
}

/** Every email the app has sent, or would have sent before an email service is connected. */
function Outbox() {
  const app = useApp();
  const { data } = useApi<OutboxEntry[]>('/outbox');
  const [open, setOpen] = useState<number | null>(null);
  const waiting = data?.some((m) => m.status === 'not_configured');
  return (
    <>
      <h2 className="mb-1 font-semibold">Email outbox</h2>
      <p className="mb-3 text-sm text-slate-500">
        Portal invites and sign-in links sent to clients.
        {waiting && ' No email service is connected yet, so these are waiting here. You can copy a link and text it to the client.'}
      </p>
      <div className="card mb-10 divide-y divide-slate-100">
        {!data?.length && <p className="p-4 text-sm text-slate-400">No emails yet. Adding a client with an email address sends them a portal invite.</p>}
        {data?.map((m) => (
          <div key={m.id} className="p-4 text-sm">
            <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.subject}</div>
                <div className="text-xs text-slate-500">
                  To {m.to} · {relative(m.createdAt)}
                </div>
              </div>
              <span
                className={
                  'shrink-0 rounded px-1.5 py-0.5 text-xs ' +
                  (m.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : m.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700')
                }
              >
                {m.status === 'sent' ? 'Sent' : m.status === 'failed' ? 'Failed' : m.status === 'queued' ? 'Sending' : 'Not sent'}
              </span>
            </button>
            {open === m.id && (
              <div className="mt-3 rounded-md bg-slate-50 p-3">
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{m.body.replace('{link}', m.link ? location.origin + m.link : '')}</pre>
                {m.error && <p className="mt-2 text-xs text-rose-600">{m.error}</p>}
                {m.link && (
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(location.origin + m.link)
                        .then(() => app.toast('Link copied'))
                        .catch(() => app.toast(location.origin + m.link))
                    }
                  >
                    Copy link
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

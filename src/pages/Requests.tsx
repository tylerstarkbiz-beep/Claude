import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, ArrowRight, CalendarClock, FileSignature, Inbox, Mail, MapPin, Phone, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { dateTime, relative, shortDate } from '../format';
import { Button, DivisionBadge, EmptyState, Modal, PageHeader, Pill } from '../components/ui';
import { ChainBar } from '../components/Chain';
import { NotesFeed } from '../components/NotesFeed';
import { TextClientButton } from '../components/TextClient';
import { REQUEST_STATUS_META, type Chain, type Client, type Quote, type RequestStatus, type ServiceRequest } from '../../shared/types';

const TABS: { key: string; label: string; match: (s: RequestStatus) => boolean }[] = [
  { key: 'open', label: 'Open', match: (s) => s === 'new' || s === 'assessment_scheduled' },
  { key: 'converted', label: 'Converted', match: (s) => s === 'converted' },
  { key: 'archived', label: 'Archived', match: (s) => s === 'archived' },
  { key: 'all', label: 'All', match: () => true },
];

export function StatusPill({ meta }: { meta: { label: string; color: string } }) {
  return <Pill label={meta.label} color={meta.color} />;
}

/** Requests: a client (or the office on their behalf) asking for a visit to inspect and quote. */
export function Requests() {
  const app = useApp();
  const navigate = useNavigate();
  const { data: requests } = useApi<ServiceRequest[]>(`/requests${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const [tab, setTab] = useState('open');
  const [creating, setCreating] = useState(false);
  const clientName = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c.name])), [clients]);
  const shown = (requests ?? []).filter((r) => TABS.find((t) => t.key === tab)!.match(r.status));

  return (
    <div>
      <PageHeader
        title="Requests"
        subtitle="Visits to inspect and quote. Convert a request to a quote when you're ready to price it; the request stays on the client's account."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New request
          </Button>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const n = (requests ?? []).filter((r) => t.match(r.status)).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm',
                tab === t.key ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t.label} <span className="text-slate-400">{n}</span>
            </button>
          );
        })}
      </div>
      {!requests ? (
        <div className="card h-40 animate-pulse" />
      ) : !shown.length ? (
        <EmptyState>{tab === 'open' ? 'No open requests. New ones from the customer portal show up here.' : 'Nothing here.'}</EmptyState>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Request</th>
                <th className="px-3 font-medium">Client</th>
                <th className="px-3 font-medium">Status</th>
                <th className="px-3 font-medium">Assessment</th>
                <th className="px-4 text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/requests/${r.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: app.division(r.divisionId)?.color }} />
                      <span className="font-medium">{r.title}</span>
                      {r.source === 'portal' && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">From portal</span>}
                    </div>
                    <div className="pl-4 font-mono text-xs text-slate-400">{r.number}</div>
                  </td>
                  <td className="px-3">{clientName.get(r.clientId)}</td>
                  <td className="px-3">
                    <StatusPill meta={REQUEST_STATUS_META[r.status]} />
                  </td>
                  <td className="px-3 text-slate-600">
                    {r.assessmentStart ? (
                      <>
                        {dateTime(r.assessmentStart)}
                        {r.assessmentAssigneeId && <span className="text-slate-400"> · {app.user(r.assessmentAssigneeId)?.name.split(' ')[0]}</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">Not booked</span>
                    )}
                  </td>
                  <td className="px-4 text-right text-slate-500">{relative(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {creating && <RequestForm onClose={() => setCreating(false)} />}
    </div>
  );
}

/** New request from the office (phone call, email, walk-in). */
export function RequestForm({ onClose, clientId }: { onClose: () => void; clientId?: number }) {
  const app = useApp();
  const navigate = useNavigate();
  const { data: clients } = useApi<Client[]>('/clients');
  const [form, setForm] = useState({
    divisionId: app.divisionId ?? app.divisions[0]?.id,
    clientId: clientId ?? ('' as number | ''),
    title: '',
    details: '',
    address: '',
    preferredTimes: '',
  });
  const [newClient, setNewClient] = useState<{ name: string; phone: string; email: string; address: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let cid = form.clientId;
      if (newClient) cid = (await post<Client>('/clients', newClient)).id;
      const r = await post<ServiceRequest>('/requests', { ...form, clientId: cid, address: form.address || null });
      app.toast(`Created ${r.number}`);
      onClose();
      navigate(`/requests/${r.id}`);
    } catch (err) {
      app.toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New request" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="label">Division</span>
          <div className="flex flex-wrap gap-2">
            {app.divisions.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => set('divisionId', d.id)}
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
                <input
                  className="input"
                  required
                  placeholder="Name"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                />
                <input className="input" placeholder="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                <input className="input" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                <input
                  className="input"
                  placeholder="Address"
                  value={newClient.address}
                  onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                />
                <button type="button" className="text-xs text-brand-600" onClick={() => setNewClient(null)}>
                  Choose existing client instead
                </button>
              </div>
            ) : (
              <>
                <select id="request-client" className="input" required value={form.clientId} onChange={(e) => set('clientId', Number(e.target.value))}>
                  <option value="">Select a client…</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="mt-1 text-xs text-brand-600" onClick={() => setNewClient({ name: '', phone: '', email: '', address: '' })}>
                  + New client
                </button>
              </>
            )}
          </div>
          <div>
            <span className="label">What do they need?</span>
            <input
              id="request-title"
              className="input"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Water stain on ceiling"
            />
          </div>
        </div>
        <label className="block">
          <span className="label">Details</span>
          <textarea
            id="request-details"
            className="input"
            rows={3}
            value={form.details}
            onChange={(e) => set('details', e.target.value)}
            placeholder="What they told you: the problem, when it started, access…"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Address (if not the client's)</span>
            <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>
          <label>
            <span className="label">Best times for a visit</span>
            <input className="input" value={form.preferredTimes} onChange={(e) => set('preferredTimes', e.target.value)} placeholder="e.g. Weekday mornings" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving}>Create request</Button>
        </div>
      </form>
    </Modal>
  );
}

type RequestDetailData = ServiceRequest & { client: Client; chain: Chain };

export function RequestDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const { data: r, setData, reload } = useApi<RequestDetailData>(`/requests/${id}`);
  const { data: activity, reload: reloadActivity } = useApi<{ id: number; message: string; created_at: string }[]>(`/requests/${id}/activity`);
  if (!r) return <div className="text-slate-400">Loading request…</div>;
  const canManage = app.can('manage_jobs');
  const converted = r.status === 'converted';

  async function save(changes: Partial<ServiceRequest>) {
    try {
      const next = await patch<ServiceRequest>(`/requests/${r!.id}`, changes);
      setData({ ...r!, ...next });
      reload(); // refresh the chain (status) too
      reloadActivity();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  async function toQuote() {
    try {
      const q = await post<Quote>(`/requests/${r!.id}/quote`, {});
      app.toast(`${r!.number} converted to quote ${q.number}`);
      navigate(`/quotes/${q.id}`);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link to="/requests" className="hover:text-brand-600">
              <Inbox size={14} className="mr-1 inline" />
              Requests
            </Link>
            <span>/</span>
            <span className="font-mono">{r.number}</span>
            <DivisionBadge division={app.division(r.divisionId)} />
            <StatusPill meta={REQUEST_STATUS_META[r.status]} />
            {r.source === 'portal' && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">From the customer portal</span>}
          </div>
          <input
            key={r.title}
            defaultValue={r.title}
            disabled={converted}
            onBlur={(e) => e.target.value.trim() && e.target.value !== r.title && save({ title: e.target.value.trim() })}
            className="-ml-1 w-full rounded bg-transparent px-1 text-2xl font-bold tracking-tight outline-none hover:bg-white focus:bg-white"
          />
          <div className="text-sm text-slate-500">Received {dateTime(r.createdAt)}</div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!converted && r.status !== 'archived' && (
              <Button onClick={toQuote}>
                <FileSignature size={16} /> Convert to quote <ArrowRight size={14} />
              </Button>
            )}
            {r.status === 'archived' ? (
              <Button variant="secondary" onClick={() => save({ status: r.assessmentStart ? 'assessment_scheduled' : 'new' })}>
                <RotateCcw size={16} /> Reopen
              </Button>
            ) : (
              !converted && (
                <Button variant="secondary" onClick={() => save({ status: 'archived' })} title="Not going ahead (keeps it on the account)">
                  <Archive size={16} /> Archive
                </Button>
              )
            )}
            {!converted && (
              <Button
                variant="danger"
                title="Delete request"
                onClick={async () => {
                  if (!confirm('Delete this request and its notes?')) return;
                  await del(`/requests/${r.id}`);
                  navigate('/requests');
                }}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <ChainBar kind="request" id={r.id} chain={r.chain} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">What they need</h2>
            <textarea
              key={r.details}
              className="input"
              rows={4}
              defaultValue={r.details}
              disabled={converted}
              onBlur={(e) => e.target.value !== r.details && save({ details: e.target.value })}
              placeholder="Details of the problem"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Address</span>
                <input
                  key={r.address}
                  className="input"
                  defaultValue={r.address ?? ''}
                  disabled={converted}
                  onBlur={(e) => e.target.value !== (r.address ?? '') && save({ address: e.target.value })}
                />
              </label>
              <label>
                <span className="label">Best times for a visit</span>
                <input
                  key={r.preferredTimes}
                  className="input"
                  defaultValue={r.preferredTimes ?? ''}
                  disabled={converted}
                  onBlur={(e) => e.target.value !== (r.preferredTimes ?? '') && save({ preferredTimes: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Notes & photos</h2>
            <p className="mb-4 text-xs text-slate-500">
              These follow the work onto the quote, the job and the invoice. Customer notes and photos from the portal show in blue.
            </p>
            <NotesFeed stage="request" id={r.id} chain />
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Client</h2>
            <Link to={`/clients/${r.client.id}`} className="font-medium hover:text-brand-600">
              {r.client.name}
            </Link>
            <div className="mt-1 space-y-1 text-sm text-slate-600">
              {r.address && (
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} /> {r.address}
                </div>
              )}
              {r.client.phone && (
                <a href={`tel:${r.client.phone}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Phone size={13} /> {r.client.phone}
                </a>
              )}
              {r.client.email && (
                <a href={`mailto:${r.client.email}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Mail size={13} /> {r.client.email}
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.client.phone && (
                <a
                  href={`tel:${r.client.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <Phone size={15} /> Call
                </a>
              )}
              <TextClientButton job={{ stage: 'request', id: r.id, scheduled: !!r.assessmentStart }} onSent={reloadActivity} />
            </div>
          </section>

          <AssessmentCard r={r} disabled={converted || r.status === 'archived'} onSave={save} />

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Activity</h2>
            <div className="space-y-3">
              {activity?.map((a) => (
                <div key={a.id} className="text-sm">
                  <div>{a.message}</div>
                  <div className="text-xs text-slate-400">{relative(a.created_at)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Book the visit to inspect and quote. */
function AssessmentCard({ r, disabled, onSave }: { r: ServiceRequest; disabled: boolean; onSave: (c: Partial<ServiceRequest>) => Promise<void> }) {
  const app = useApp();
  const [start, setStart] = useState(r.assessmentStart?.slice(0, 16) ?? '');
  const [end, setEnd] = useState(r.assessmentEnd?.slice(0, 16) ?? '');
  const [who, setWho] = useState<number | ''>(r.assessmentAssigneeId ?? '');
  const techs = app.activeUsers.filter((u) => u.divisionIds.includes(r.divisionId));
  const changed = start !== (r.assessmentStart?.slice(0, 16) ?? '') || end !== (r.assessmentEnd?.slice(0, 16) ?? '') || who !== (r.assessmentAssigneeId ?? '');

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <CalendarClock size={18} /> Assessment visit
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        {r.assessmentStart ? `Booked for ${dateTime(r.assessmentStart)}.` : 'Book a visit to inspect and quote.'}
        {r.preferredTimes && ` Client prefers: ${r.preferredTimes}.`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">Start</span>
          <input
            id="assessment-start"
            type="datetime-local"
            className="input"
            disabled={disabled}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value && !end) {
                const d = new Date(e.target.value);
                d.setHours(d.getHours() + 1);
                const p = (n: number) => String(n).padStart(2, '0');
                setEnd(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
              }
            }}
          />
        </label>
        <label>
          <span className="label">End</span>
          <input type="datetime-local" className="input" disabled={disabled} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="label">Who's going</span>
        <select id="assessment-who" className="input" disabled={disabled} value={who} onChange={(e) => setWho(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Unassigned</option>
          {techs.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      {!disabled && (
        <div className="mt-3 flex gap-2">
          <Button disabled={!changed} onClick={() => onSave({ assessmentStart: start || null, assessmentEnd: end || null, assessmentAssigneeId: who || null })}>
            {r.assessmentStart ? 'Update visit' : 'Book visit'}
          </Button>
          {r.assessmentStart && (
            <Button variant="ghost" onClick={() => (setStart(''), setEnd(''), onSave({ assessmentStart: null, assessmentEnd: null }))}>
              Clear
            </Button>
          )}
        </div>
      )}
      {r.assessmentStart && (
        <p className="mt-2 text-xs text-slate-500">Booked {shortDate(r.assessmentStart)}. Text the client a confirmation with the Text button above.</p>
      )}
    </section>
  );
}

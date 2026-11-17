import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { money, relative, shortDate, time, todayISO } from '../format';
import { resizeImage } from '../photos';
import { Button, EmptyState, Modal } from '../components/ui';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { InvoiceDocument } from '../components/InvoiceDocument';
import type { Chain, CompanySettings, InvoiceDetail, JobNote, JobStatus, LineItem, QuoteItem, QuoteStatus, RequestStatus } from '../../shared/types';
import { papi, usePortal } from './session';
import { loadStripe } from './stripe';
import { Section, usePortalApp } from './PortalApp';

interface PortalJob {
  id: number;
  number: string;
  title: string;
  description: string | null;
  status: JobStatus;
  address: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  total: number;
  division: { name: string; color: string };
  tech: { firstName: string; color: string } | null;
  lineItems: LineItem[];
  createdAt: string;
}

interface PortalRequest {
  id: number;
  number: string;
  title: string;
  details: string;
  address: string | null;
  preferredTimes: string | null;
  status: RequestStatus;
  assessmentStart: string | null;
  assessmentEnd: string | null;
  division: { name: string; color: string };
  quote: { id: number; number: string; status: QuoteStatus } | null;
  job: { id: number; number: string } | null;
  createdAt: string;
}

interface PortalQuote {
  id: number;
  number: string;
  title: string;
  description: string;
  address: string | null;
  status: QuoteStatus;
  total: number;
  items: QuoteItem[];
  division: { name: string; color: string };
  depositPercent: number;
  sentAt: string | null;
  approvedAt: string | null;
  signature: { name: string; signedAt: string } | null;
  deposit: { invoiceId: number; number: string; amount: number; balance: number; status: string } | null;
  request: { id: number; number: string } | null;
  job: { id: number; number: string } | null;
  createdAt: string;
}

interface History {
  chain: Chain;
  notes: JobNote[];
}

interface PortalInvoice {
  id: number;
  number: string;
  status: 'sent' | 'paid' | 'void';
  overdue: boolean;
  issueDate: string;
  dueDate: string;
  total: number;
  balance: number;
  jobTitle: string | null;
}

interface Card {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// Status names written for customers rather than the office.
const CLIENT_STATUS: Record<JobStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: '#0ea5e9' },
  in_progress: { label: 'In progress', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  invoiced: { label: 'Completed', color: '#10b981' },
  paid: { label: 'Completed', color: '#10b981' },
  cancelled: { label: 'Cancelled', color: '#94a3b8' },
};

const REQUEST_CLIENT_STATUS: Record<RequestStatus, { label: string; color: string }> = {
  new: { label: 'Received', color: '#64748b' },
  assessment_scheduled: { label: 'Visit booked', color: '#0ea5e9' },
  converted: { label: 'Quoted', color: '#16a34a' },
  archived: { label: 'Closed', color: '#94a3b8' },
};

const QUOTE_CLIENT_STATUS: Record<QuoteStatus, { label: string; color: string }> = {
  draft: { label: 'Being prepared', color: '#64748b' },
  sent: { label: 'Waiting for your approval', color: '#8b5cf6' },
  changes_requested: { label: 'Changes requested', color: '#f59e0b' },
  approved: { label: 'Approved', color: '#16a34a' },
  declined: { label: 'Declined', color: '#94a3b8' },
  converted: { label: 'Approved · work booked', color: '#16a34a' },
};

function Badge({ meta }: { meta: { label: string; color: string } }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: meta.color }}>
      {meta.label}
    </span>
  );
}

function StatusPill({ status }: { status: JobStatus }) {
  return <Badge meta={CLIENT_STATUS[status]} />;
}

const when = (j: { scheduledStart: string | null; scheduledEnd: string | null }) =>
  j.scheduledStart
    ? `${new Date(j.scheduledStart).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${time(j.scheduledStart)}${j.scheduledEnd ? ` – ${time(j.scheduledEnd)}` : ''}`
    : 'Not scheduled yet';

const cardName = (brand: string) => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' })[brand] ?? brand;

// ---------- History: the whole chain and the notes & photos shared with the client ----------

const STAGE: Record<string, string> = { request: 'Request', quote: 'Quote', job: 'Work' };

/** One piece of work from request to invoice, with everything shared with the client along the way. */
export function WorkHistory({ kind, id, data }: { kind: 'request' | 'quote' | 'job' | 'invoice'; id: number; data?: History }) {
  const { data: fetched } = usePortal<History>(data ? null : `/portal/history/${kind}/${id}`);
  const h = data ?? fetched;
  const [viewing, setViewing] = useState<string | null>(null);
  if (!h) return <div className="h-16 animate-pulse rounded-lg bg-slate-100" />;
  const steps = [
    h.chain.request && { label: 'Request', number: h.chain.request.number, to: '/portal/requests' },
    h.chain.quote && { label: 'Quote', number: h.chain.quote.number, to: '/portal/quotes' },
    h.chain.job && { label: 'Work', number: h.chain.job.number, to: '/portal/visits' },
    ...h.chain.invoices.map((i) => ({ label: i.kind === 'deposit' ? 'Deposit' : 'Invoice', number: i.number, to: `/portal/invoices/${i.id}` })),
  ].filter(Boolean) as { label: string; number: string; to: string }[];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((s, i) => (
          <span key={s.number} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-slate-300" />}
            <Link to={s.to} className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:border-brand-300">
              <span className="text-slate-500">{s.label}</span> <span className="font-medium">{s.number}</span>
            </Link>
          </span>
        ))}
      </div>
      {h.notes.length ? (
        <div className="space-y-2">
          {h.notes.map((n) => (
            <div key={n.id} className={clsx('rounded-lg border p-3 text-sm', n.fromClient ? 'border-sky-200 bg-sky-50/60' : 'border-slate-200 bg-white')}>
              <div className="mb-1 text-xs text-slate-500">
                {n.fromClient ? 'You' : 'Our team'} · {STAGE[n.stage]} {n.stageNumber} · {relative(n.createdAt)}
              </div>
              {n.body && <p className="whitespace-pre-wrap">{n.body}</p>}
              {n.photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.photos.map((p) => (
                    <button key={p.id} onClick={() => setViewing(p.url)}>
                      <img src={p.url} alt="" loading="lazy" className="h-20 w-20 rounded object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No notes or photos shared yet.</p>
      )}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setViewing(null)}>
          <img src={viewing} alt="" className="max-h-full max-w-full rounded" />
          <button className="absolute right-4 top-4 text-white" aria-label="Close">
            <X size={28} />
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryToggle({ kind, id, label = 'Notes, photos & history' }: { kind: 'request' | 'quote' | 'job' | 'invoice'; id: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-sm font-medium text-brand-700">
        <ChevronDown size={16} className={clsx('transition', !open && '-rotate-90')} /> {label}
      </button>
      {open && (
        <div className="mt-3">
          <WorkHistory kind={kind} id={id} />
        </div>
      )}
    </div>
  );
}

// ---------- Home ----------

export function PortalHome() {
  const { me, brand } = usePortalApp();
  const { data: jobs } = usePortal<PortalJob[]>('/portal/jobs');
  const { data: invoices } = usePortal<PortalInvoice[]>('/portal/invoices');
  const { data: quotes } = usePortal<PortalQuote[]>('/portal/quotes');
  const { data: requests } = usePortal<PortalRequest[]>('/portal/requests');
  const today = todayISO();
  const next = (jobs ?? [])
    .filter((j) => j.scheduledStart && j.scheduledStart.slice(0, 10) >= today && (j.status === 'scheduled' || j.status === 'in_progress'))
    .sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!))[0];
  const due = (invoices ?? []).filter((i) => i.status === 'sent' && i.balance > 0);
  const balance = due.reduce((a, i) => a + i.balance, 0);
  const waiting = (quotes ?? []).filter((q) => q.status === 'sent' || q.status === 'changes_requested');
  const open = (requests ?? []).filter((r) => r.status === 'new' || r.status === 'assessment_scheduled');

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Hi, {me.client.name.split(' ')[0]}</h1>
      <p className="mb-6 text-slate-500">Everything you have with {brand.name}, in one place.</p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Tile
          to="/portal/invoices"
          title="Balance due"
          value={money(balance)}
          sub={due.length ? `${due.length} open invoice${due.length > 1 ? 's' : ''}${due.some((i) => i.overdue) ? ' · past due' : ''}` : 'You are all paid up'}
          alert={due.some((i) => i.overdue)}
        />
        <Tile
          to="/portal/visits"
          title="Next visit"
          value={next ? new Date(next.scheduledStart!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'None scheduled'}
          sub={next ? `${time(next.scheduledStart)} · ${next.title}` : 'We will let you know when we book one'}
        />
        <Tile
          to="/portal/quotes"
          title="Quotes to review"
          value={String(waiting.length)}
          sub={waiting.length ? 'Waiting for your approval' : 'Nothing waiting on you'}
          highlight={waiting.length > 0}
        />
        <Tile to="/portal/requests" title="Open requests" value={String(open.length)} sub="We'll reach out to schedule a visit" />
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="font-semibold">Need something done?</div>
          <div className="text-sm text-slate-500">Send us a request (photos help!) and we'll set up a visit to take a look and quote it.</div>
        </div>
        <Link
          to="/portal/requests"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={16} /> Request service
        </Link>
      </div>
    </>
  );
}

function Tile({ to, title, value, sub, alert, highlight }: { to: string; title: string; value: string; sub: string; alert?: boolean; highlight?: boolean }) {
  return (
    <Link to={to} className={clsx('card group p-5 transition hover:shadow-md', highlight && 'border-brand-300')}>
      <div className="flex items-center justify-between text-sm text-slate-500">
        {title} <ChevronRight size={16} className="text-slate-300 group-hover:text-brand-600" />
      </div>
      <div className={clsx('mt-1 text-2xl font-bold', alert && 'text-rose-600')}>{value}</div>
      <div className={clsx('mt-1 truncate text-sm', alert ? 'text-rose-600' : 'text-slate-500')}>{sub}</div>
    </Link>
  );
}

// ---------- Requests ----------

export function RequestsPage() {
  const { me, toast } = usePortalApp();
  const { data: requests, reload } = usePortal<PortalRequest[]>('/portal/requests');
  const [form, setForm] = useState({ divisionId: '', summary: '', description: '', preferredTimes: '', address: me.client.address ?? '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const resized = await Promise.all([...files].slice(0, 10).map((f) => resizeImage(f)));
      setPhotos((p) => [...p, ...resized].slice(0, 10));
    } catch {
      toast('Could not read that image', true);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await papi('/portal/requests', { method: 'POST', body: { ...form, photos: photos.map((dataUrl) => ({ dataUrl })) } });
      toast("Request sent. We'll be in touch to set up a visit.");
      setForm({ ...form, summary: '', description: '', preferredTimes: '' });
      setPhotos([]);
      setOpen(false);
      reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title="Request service"
        action={
          !open && (
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} /> New request
            </Button>
          )
        }
      >
        {open && (
          <form onSubmit={submit} className="card space-y-4 p-5">
            <div>
              <span className="label">What kind of service?</span>
              <div className="flex flex-wrap gap-2">
                {me.divisions.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setForm({ ...form, divisionId: String(d.id) })}
                    className="rounded-full border px-3 py-1.5 text-sm font-medium"
                    style={form.divisionId === String(d.id) ? { background: d.color, borderColor: d.color, color: 'white' } : { borderColor: '#cbd5e1' }}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="label">Short summary</span>
              <input
                id="req-summary"
                className="input"
                maxLength={80}
                placeholder="e.g. Water in the basement"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">Tell us what's going on</span>
              <textarea
                id="req-description"
                className="input"
                rows={4}
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div>
              <span className="label">Photos (optional)</span>
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="h-16 w-16 rounded object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-0.5 text-white"
                      aria-label="Remove photo"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Camera size={16} /> Add photos
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Service address</span>
                <input id="req-address" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">When works for a visit?</span>
                <input
                  id="req-times"
                  className="input"
                  placeholder="e.g. Weekday mornings, ASAP"
                  value={form.preferredTimes}
                  onChange={(e) => setForm({ ...form, preferredTimes: e.target.value })}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy || !form.divisionId}>{busy ? 'Sending…' : 'Send request'}</Button>
            </div>
            {!form.divisionId && <p className="text-right text-xs text-slate-500">Pick a service type to send your request.</p>}
          </form>
        )}
      </Section>

      <Section title="Your requests">
        {!requests?.length ? (
          <EmptyState>No requests yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="card overflow-hidden border-l-4" style={{ borderLeftColor: r.division.color }}>
                <div className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{r.title}</div>
                    <Badge meta={REQUEST_CLIENT_STATUS[r.status]} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.number} · sent {shortDate(r.createdAt.slice(0, 10))}
                  </div>
                  {r.details && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{r.details}</p>}
                  {r.assessmentStart && r.status === 'assessment_scheduled' && (
                    <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-sky-700">
                      <CalendarDays size={14} /> We'll come take a look {when({ scheduledStart: r.assessmentStart, scheduledEnd: r.assessmentEnd })}
                    </div>
                  )}
                  {r.quote && (
                    <Link to="/portal/quotes" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                      Quote {r.quote.number}: {QUOTE_CLIENT_STATUS[r.quote.status].label} <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
                <HistoryToggle kind="request" id={r.id} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ---------- Quotes ----------

export function QuotesPage() {
  const { toast } = usePortalApp();
  const { data: quotes, reload } = usePortal<PortalQuote[]>('/portal/quotes');
  const [asking, setAsking] = useState<number | null>(null);
  const [signing, setSigning] = useState<PortalQuote | null>(null);
  const [message, setMessage] = useState('');

  async function askChanges(q: PortalQuote) {
    if (!message.trim()) return;
    try {
      await papi(`/portal/quotes/${q.id}/changes`, { method: 'POST', body: { message } });
      toast('Message sent to our office.');
      setAsking(null);
      setMessage('');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const open = (q: PortalQuote) => q.status === 'sent' || q.status === 'changes_requested';

  return (
    <Section title="Quotes">
      {!quotes?.length ? (
        <EmptyState>No quotes right now.</EmptyState>
      ) : (
        <div className="space-y-4">
          {quotes.map((q) => (
            <div key={q.id} className={clsx('card overflow-hidden', open(q) && 'border-brand-300')}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide" style={{ color: q.division.color }}>
                    {q.division.name}
                  </div>
                  <div className="text-lg font-semibold">{q.title}</div>
                  <div className="text-xs text-slate-500">
                    {q.number}
                    {q.address && ` · ${q.address}`}
                  </div>
                  <div className="mt-1">
                    <Badge meta={QUOTE_CLIENT_STATUS[q.status]} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Quote total</div>
                  <div className="text-2xl font-bold">{money(q.total)}</div>
                  {open(q) && q.depositPercent > 0 && (
                    <div className="text-xs text-slate-500">
                      {q.depositPercent}% deposit ({money((q.total * q.depositPercent) / 100)}) due on approval
                    </div>
                  )}
                </div>
              </div>
              {q.description && <p className="whitespace-pre-wrap border-b border-slate-100 px-5 py-3 text-sm text-slate-600">{q.description}</p>}
              <table className="w-full text-sm">
                <tbody>
                  {q.items.map((li) => (
                    <tr key={li.id} className="border-b border-slate-50">
                      <td className="px-5 py-2">{li.description}</td>
                      <td className="px-2 py-2 text-right text-slate-500">× {li.quantity}</td>
                      <td className="px-5 py-2 text-right font-medium">{money(li.quantity * li.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-end gap-2 p-4">
                {q.approvedAt ? (
                  <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                      <CheckCircle2 size={18} />
                      {q.signature ? `Approved and signed by ${q.signature.name} on ${shortDate(q.signature.signedAt.slice(0, 10))}` : 'Approved'}
                      {q.job && ` · work order ${q.job.number}`}
                    </span>
                    {q.deposit &&
                      (q.deposit.status === 'paid' ? (
                        <span className="text-sm font-medium text-emerald-700">Deposit of {money(q.deposit.amount)} paid. Thank you!</span>
                      ) : (
                        <Link
                          to={`/portal/invoices/${q.deposit.invoiceId}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                        >
                          <CreditCard size={16} /> Pay {money(q.deposit.balance)} deposit
                        </Link>
                      ))}
                  </div>
                ) : !open(q) ? (
                  <span className="text-sm text-slate-500">This quote is no longer open.</span>
                ) : asking === q.id ? (
                  <div className="w-full space-y-2">
                    <textarea
                      id={`changes-${q.id}`}
                      className="input"
                      rows={3}
                      placeholder="What would you like changed?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setAsking(null)}>
                        Cancel
                      </Button>
                      <Button onClick={() => askChanges(q)}>Send</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {q.status === 'changes_requested' && (
                      <span className="mr-auto text-sm text-amber-700">We got your change request and will update the quote.</span>
                    )}
                    <Button variant="secondary" onClick={() => setAsking(q.id)}>
                      <MessageSquare size={16} /> Ask for changes
                    </Button>
                    <Button onClick={() => setSigning(q)}>
                      <Check size={16} /> Approve & sign
                    </Button>
                  </>
                )}
              </div>
              <HistoryToggle kind="quote" id={q.id} />
            </div>
          ))}
        </div>
      )}
      {signing && (
        <SignQuote
          quote={signing}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            reload();
          }}
        />
      )}
    </Section>
  );
}

/** Approve a quote by typing your name and signing. */
function SignQuote({ quote, onClose, onSigned }: { quote: PortalQuote; onClose: () => void; onSigned: () => void }) {
  const { me, brand, toast } = usePortalApp();
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(me.client.name);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const deposit = quote.depositPercent > 0 ? (quote.total * quote.depositPercent) / 100 : 0;

  async function sign() {
    const signature = pad.current?.toDataUrl();
    if (!signature) return;
    setBusy(true);
    try {
      const res = await papi<PortalQuote>(`/portal/quotes/${quote.id}/approve`, { method: 'POST', body: { signatureName: name, signature } });
      toast(res.deposit ? `Quote signed. Next: pay your ${money(res.deposit.amount)} deposit.` : "Quote signed. We'll contact you to schedule the work.");
      onSigned();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Approve & sign quote" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium">{quote.title}</div>
          <div className="text-slate-500">
            {quote.number} · Total {money(quote.total)}
            {deposit > 0 && ` · ${quote.depositPercent}% deposit ${money(deposit)}`}
          </div>
        </div>
        <label className="block">
          <span className="label">Your full name</span>
          <input id="sign-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Sign below</span>
            <button type="button" className="text-xs text-brand-600" onClick={() => pad.current?.clear()}>
              Clear
            </button>
          </div>
          <SignaturePad ref={pad} onChange={setHasInk} />
        </div>
        <p className="text-xs text-slate-500">
          By signing, I approve this quote of {money(quote.total)} and authorize {brand.name} to do the work described
          {deposit > 0 ? `, and agree to pay a ${money(deposit)} deposit now with the balance due on completion` : ''}. My typed name and signature are my
          electronic signature.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={sign} disabled={busy || !hasInk || !name.trim()}>
            {busy ? 'Signing…' : 'Approve & sign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Visits ----------

export function VisitsPage() {
  const { data: jobs } = usePortal<PortalJob[]>('/portal/jobs');
  const today = todayISO();
  const scheduled = (jobs ?? []).filter((j) => j.scheduledStart);
  const upcoming = scheduled
    .filter((j) => j.scheduledStart!.slice(0, 10) >= today && ['scheduled', 'in_progress'].includes(j.status))
    .sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!));
  const past = scheduled.filter((j) => !upcoming.includes(j));

  const Visit = ({ j }: { j: PortalJob }) => (
    <div className="card overflow-hidden border-l-4" style={{ borderLeftColor: j.division.color }}>
      <div className="flex gap-4 p-4">
        <div className="w-14 shrink-0 text-center">
          <div className="text-xs uppercase text-slate-500">{new Date(j.scheduledStart!).toLocaleDateString('en-US', { month: 'short' })}</div>
          <div className="text-2xl font-bold leading-none">{new Date(j.scheduledStart!).getDate()}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">{j.title}</div>
            <StatusPill status={j.status} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <CalendarDays size={14} /> {when(j)}
          </div>
          {j.address && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin size={14} /> {j.address}
            </div>
          )}
          {j.tech && <div className="mt-1 text-sm text-slate-500">Your technician: {j.tech.firstName}</div>}
        </div>
      </div>
      <HistoryToggle kind="job" id={j.id} />
    </div>
  );

  return (
    <>
      <Section title="Upcoming visits">
        {!upcoming.length ? (
          <EmptyState>No visits scheduled right now.</EmptyState>
        ) : (
          <div className="space-y-3">
            {upcoming.map((j) => (
              <Visit key={j.id} j={j} />
            ))}
          </div>
        )}
      </Section>
      {past.length > 0 && (
        <Section title="Past visits">
          <div className="space-y-3 opacity-90">
            {past.map((j) => (
              <Visit key={j.id} j={j} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ---------- Invoices ----------

export function InvoicesPage() {
  const { data: invoices } = usePortal<PortalInvoice[]>('/portal/invoices');
  return (
    <Section title="Invoices">
      {!invoices?.length ? (
        <EmptyState>No invoices yet.</EmptyState>
      ) : (
        <div className="card divide-y divide-slate-100">
          {invoices.map((i) => (
            <Link key={i.id} to={`/portal/invoices/${i.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{i.jobTitle ?? i.number}</div>
                <div className="text-xs text-slate-500">
                  {i.number} · issued {shortDate(i.issueDate)} · due {shortDate(i.dueDate)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{money(i.balance > 0 ? i.balance : i.total)}</div>
                <div
                  className={clsx(
                    'text-xs font-medium',
                    i.status === 'paid' ? 'text-emerald-600' : i.overdue ? 'text-rose-600' : i.status === 'void' ? 'text-slate-400' : 'text-sky-600',
                  )}
                >
                  {i.status === 'paid' ? 'Paid' : i.status === 'void' ? 'Void' : i.overdue ? 'Past due' : 'Due'}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

export function InvoicePage() {
  const { id } = useParams();
  const { data, reload } = usePortal<{
    company: CompanySettings;
    invoice: Omit<InvoiceDetail, 'job'> & { job: { number: string; title: string; address: string | null } | null };
    history: History;
  }>(`/portal/invoices/${id}`);
  if (!data) return <div className="text-slate-400">Loading…</div>;
  const inv = data.invoice;
  return (
    <>
      <Link to="/portal/invoices" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← All invoices
      </Link>
      {inv.status === 'sent' && inv.balance > 0 && <PayPanel invoiceId={inv.id} balance={inv.balance} onPaid={reload} />}
      <InvoiceDocument invoice={inv} company={data.company} />
      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-semibold">About this work</h2>
        <WorkHistory kind="invoice" id={inv.id} data={data.history} />
      </section>
    </>
  );
}

function PayPanel({ invoiceId, balance, onPaid }: { invoiceId: number; balance: number; onPaid: () => void }) {
  const { me, brand, toast } = usePortalApp();
  const { data: cards } = usePortal<Card[]>(me.payments.enabled ? '/portal/cards' : null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = cardId ?? cards?.find((c) => c.isDefault)?.id ?? cards?.[0]?.id;

  if (!me.payments.enabled) {
    return (
      <div className="card mb-4 p-4 text-sm text-slate-600">
        Online payment isn't available yet. {brand.phone ? `Call us at ${brand.phone} to pay by card, or mail a check.` : 'Contact us to pay.'}
      </div>
    );
  }

  async function pay() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await papi<{ requiresAction: boolean; clientSecret?: string }>(`/portal/invoices/${invoiceId}/pay`, {
        method: 'POST',
        body: { paymentMethodId: selected },
      });
      if (res.requiresAction) {
        // The bank wants the cardholder to approve (3-D Secure). Stripe shows its window, then we confirm.
        const stripe = await loadStripe(me.payments.publishableKey!);
        const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret: res.clientSecret });
        if (error) throw new Error(error.message);
        await papi(`/portal/invoices/${invoiceId}/pay/confirm`, { method: 'POST', body: { paymentIntentId: paymentIntent.id } });
      }
      toast(`Payment of ${money(balance)} received. Thank you!`);
      onPaid();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
      <div className="mr-auto">
        <div className="text-sm text-slate-500">Balance due</div>
        <div className="text-2xl font-bold">{money(balance)}</div>
      </div>
      {cards && !cards.length ? (
        <Link to="/portal/payment" className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          <CreditCard size={16} /> Add a card to pay
        </Link>
      ) : (
        <>
          <select id="pay-card" className="input w-auto" value={selected ?? ''} onChange={(e) => setCardId(e.target.value)}>
            {cards?.map((c) => (
              <option key={c.id} value={c.id}>
                {cardName(c.brand)} •••• {c.last4}
              </option>
            ))}
          </select>
          <Button onClick={pay} disabled={busy || !selected} className="py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Pay {money(balance)}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------- Payment methods ----------

export function PaymentPage() {
  const { me, brand, toast } = usePortalApp();
  const { data: cards, setData, reload } = usePortal<Card[]>(me.payments.enabled ? '/portal/cards' : null);
  const [adding, setAdding] = useState(false);

  if (!me.payments.enabled) {
    return (
      <Section title="Payment methods">
        <div className="card p-5 text-sm text-slate-600">
          Saving a card for online payment isn't available yet. {brand.phone && `Call us at ${brand.phone} if you'd like to pay by card.`}
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Payment methods"
      action={
        !adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> Add a card
          </Button>
        )
      }
    >
      <p className="mb-4 max-w-2xl text-sm text-slate-500">
        Save a card to pay invoices in one tap. With your OK, {brand.name} can also charge it when a job is finished. Card details are stored securely by our
        payment processor, Stripe. We never see your full card number.
      </p>
      {adding && (
        <AddCard
          onDone={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {!cards ? (
        <div className="text-slate-400">Loading…</div>
      ) : !cards.length ? (
        !adding && <EmptyState>No saved cards yet.</EmptyState>
      ) : (
        <div className="card divide-y divide-slate-100">
          {cards.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <CreditCard className="text-slate-400" />
              <div className="flex-1">
                <div className="font-medium">
                  {cardName(c.brand)} •••• {c.last4}
                  {c.isDefault && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">Default</span>}
                </div>
                <div className="text-xs text-slate-500">
                  Expires {String(c.expMonth).padStart(2, '0')}/{c.expYear}
                </div>
              </div>
              {!c.isDefault && (
                <Button variant="ghost" onClick={async () => setData(await papi<Card[]>(`/portal/cards/${c.id}/default`, { method: 'POST' }))}>
                  Make default
                </Button>
              )}
              <Button
                variant="danger"
                onClick={async () => {
                  setData(await papi<Card[]>(`/portal/cards/${c.id}`, { method: 'DELETE' }));
                  toast('Card removed');
                }}
                aria-label="Remove card"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Stripe's Payment Element in our form; saving creates a card on the client's Stripe customer. */
function AddCard({ onDone }: { onDone: () => void }) {
  const { brand, toast } = usePortalApp();
  const mountRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<{ stripe: any; elements: any } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let element: any;
    (async () => {
      try {
        const { clientSecret, publishableKey } = await papi<{ clientSecret: string; publishableKey: string }>('/portal/cards/setup', { method: 'POST' });
        const s = await loadStripe(publishableKey);
        if (cancelled) return;
        const elements = s.elements({ clientSecret, appearance: { variables: { colorPrimary: brand.brandColor, borderRadius: '6px' } } });
        element = elements.create('payment');
        element.mount(mountRef.current);
        setStripe({ stripe: s, elements });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      element?.destroy();
    };
  }, [brand.brandColor]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe) return;
    setBusy(true);
    setError('');
    const { error: err } = await stripe.stripe.confirmSetup({ elements: stripe.elements, redirect: 'if_required' });
    setBusy(false);
    if (err) return setError(err.message);
    toast('Card saved');
    onDone();
  }

  return (
    <form onSubmit={save} className="card mb-4 space-y-4 p-5">
      <div ref={mountRef} className="min-h-24">
        {!stripe && !error && <div className="text-sm text-slate-400">Loading secure card form…</div>}
      </div>
      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {/* Consent for charges made later without the client present (card-network rules). */}
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" className="mt-1" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          I authorize {brand.name} to save this card and charge it for invoices on my account, including work completed at my request, until I remove the card
          here.
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!stripe || busy || !agreed}>{busy ? 'Saving…' : 'Save card'}</Button>
      </div>
    </form>
  );
}

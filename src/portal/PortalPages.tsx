import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, Check, CheckCircle2, ChevronRight, CreditCard, Loader2, MapPin, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { money, shortDate, time, todayISO } from '../format';
import { Button, EmptyState } from '../components/ui';
import { InvoiceDocument } from '../components/InvoiceDocument';
import type { CompanySettings, InvoiceDetail, JobStatus, LineItem } from '../../shared/types';
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
  approvedAt: string | null;
  lineItems: LineItem[];
  createdAt: string;
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
  request: { label: 'Request received', color: '#64748b' },
  quoted: { label: 'Estimate ready', color: '#8b5cf6' },
  scheduled: { label: 'Scheduled', color: '#0ea5e9' },
  in_progress: { label: 'In progress', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#10b981' },
  invoiced: { label: 'Completed', color: '#10b981' },
  paid: { label: 'Completed', color: '#10b981' },
  cancelled: { label: 'Cancelled', color: '#94a3b8' },
};

function StatusPill({ status }: { status: JobStatus }) {
  const s = CLIENT_STATUS[status];
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

const when = (j: PortalJob) =>
  j.scheduledStart
    ? `${new Date(j.scheduledStart).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${time(j.scheduledStart)}${j.scheduledEnd ? ` – ${time(j.scheduledEnd)}` : ''}`
    : 'Not scheduled yet';

const cardName = (brand: string) => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover' })[brand] ?? brand;

// ---------- Home ----------

export function PortalHome() {
  const { me, brand } = usePortalApp();
  const { data: jobs } = usePortal<PortalJob[]>('/portal/jobs');
  const { data: invoices } = usePortal<PortalInvoice[]>('/portal/invoices');
  const today = todayISO();
  const next = (jobs ?? [])
    .filter((j) => j.scheduledStart && j.scheduledStart.slice(0, 10) >= today && (j.status === 'scheduled' || j.status === 'in_progress'))
    .sort((a, b) => a.scheduledStart!.localeCompare(b.scheduledStart!))[0];
  const due = (invoices ?? []).filter((i) => i.status === 'sent' && i.balance > 0);
  const balance = due.reduce((a, i) => a + i.balance, 0);
  const estimates = (jobs ?? []).filter((j) => j.status === 'quoted' && !j.approvedAt);
  const requests = (jobs ?? []).filter((j) => j.status === 'request');

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Hi, {me.client.name.split(' ')[0]}</h1>
      <p className="mb-6 text-slate-500">Everything you have with {brand.name}, in one place.</p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Tile to="/portal/invoices" title="Balance due" value={money(balance)} sub={due.length ? `${due.length} open invoice${due.length > 1 ? 's' : ''}${due.some((i) => i.overdue) ? ' · past due' : ''}` : 'You are all paid up'} alert={due.some((i) => i.overdue)} />
        <Tile to="/portal/visits" title="Next visit" value={next ? new Date(next.scheduledStart!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'None scheduled'} sub={next ? `${time(next.scheduledStart)} · ${next.title}` : 'We will let you know when we book one'} />
        <Tile to="/portal/estimates" title="Estimates to review" value={String(estimates.length)} sub={estimates.length ? 'Waiting for your approval' : 'Nothing waiting on you'} highlight={estimates.length > 0} />
        <Tile to="/portal/requests" title="Open requests" value={String(requests.length)} sub="We'll reach out to schedule" />
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="font-semibold">Need something done?</div>
          <div className="text-sm text-slate-500">Send us a request and we'll get back to you with a time or an estimate.</div>
        </div>
        <Link to="/portal/requests" className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
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
  const { data: jobs, reload } = usePortal<PortalJob[]>('/portal/jobs');
  const [form, setForm] = useState({ divisionId: '', summary: '', description: '', preferredTimes: '', address: me.client.address ?? '' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const requests = (jobs ?? []).filter((j) => j.status === 'request');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await papi('/portal/requests', { method: 'POST', body: form });
      toast("Request sent. We'll be in touch soon.");
      setForm({ ...form, summary: '', description: '', preferredTimes: '' });
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
              <input id="req-summary" className="input" maxLength={80} placeholder="e.g. Water in the basement" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Tell us what's going on</span>
              <textarea id="req-description" className="input" rows={4} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Service address</span>
                <input id="req-address" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">When works for you?</span>
                <input id="req-times" className="input" placeholder="e.g. Weekday mornings, ASAP" value={form.preferredTimes} onChange={(e) => setForm({ ...form, preferredTimes: e.target.value })} />
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

      <Section title="Open requests">
        {!requests.length ? (
          <EmptyState>No open requests.</EmptyState>
        ) : (
          <div className="space-y-3">
            {requests.map((j) => (
              <div key={j.id} className="card border-l-4 p-4" style={{ borderLeftColor: j.division.color }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{j.title}</div>
                  <StatusPill status={j.status} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {j.number} · sent {shortDate(j.createdAt.slice(0, 10))}
                </div>
                {j.description && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{j.description.replace(/\n\n\(Submitted in the customer portal\)$/, '')}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ---------- Estimates ----------

export function EstimatesPage() {
  const { toast } = usePortalApp();
  const { data: jobs, reload } = usePortal<PortalJob[]>('/portal/jobs');
  const [asking, setAsking] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const estimates = (jobs ?? []).filter((j) => j.status === 'quoted');

  async function approve(j: PortalJob) {
    try {
      await papi(`/portal/estimates/${j.id}/approve`, { method: 'POST' });
      toast("Estimate approved. We'll contact you to schedule the work.");
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function askChanges(j: PortalJob) {
    if (!message.trim()) return;
    await papi(`/portal/estimates/${j.id}/changes`, { method: 'POST', body: { message } });
    toast('Message sent to our office.');
    setAsking(null);
    setMessage('');
  }

  return (
    <Section title="Estimates">
      {!estimates.length ? (
        <EmptyState>No estimates right now.</EmptyState>
      ) : (
        <div className="space-y-4">
          {estimates.map((j) => (
            <div key={j.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide" style={{ color: j.division.color }}>
                    {j.division.name}
                  </div>
                  <div className="text-lg font-semibold">{j.title}</div>
                  <div className="text-xs text-slate-500">
                    {j.number}
                    {j.address && ` · ${j.address}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Estimate total</div>
                  <div className="text-2xl font-bold">{money(j.total)}</div>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {j.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-slate-50">
                      <td className="px-5 py-2">{li.description}</td>
                      <td className="px-2 py-2 text-right text-slate-500">× {li.quantity}</td>
                      <td className="px-5 py-2 text-right font-medium">{money(li.quantity * li.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-end gap-2 p-4">
                {j.approvedAt ? (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 size={18} /> You approved this on {shortDate(j.approvedAt.slice(0, 10))}. We'll be in touch to schedule.
                  </span>
                ) : asking === j.id ? (
                  <div className="w-full space-y-2">
                    <textarea id={`changes-${j.id}`} className="input" rows={3} placeholder="What would you like changed?" value={message} onChange={(e) => setMessage(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setAsking(null)}>
                        Cancel
                      </Button>
                      <Button onClick={() => askChanges(j)}>Send</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setAsking(j.id)}>
                      <MessageSquare size={16} /> Ask for changes
                    </Button>
                    <Button onClick={() => approve(j)}>
                      <Check size={16} /> Approve estimate
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
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
    <div className="card flex gap-4 border-l-4 p-4" style={{ borderLeftColor: j.division.color }}>
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
  );

  return (
    <>
      <Section title="Upcoming visits">
        {!upcoming.length ? <EmptyState>No visits scheduled right now.</EmptyState> : <div className="space-y-3">{upcoming.map((j) => <Visit key={j.id} j={j} />)}</div>}
      </Section>
      {past.length > 0 && (
        <Section title="Past visits">
          <div className="space-y-3 opacity-90">{past.map((j) => <Visit key={j.id} j={j} />)}</div>
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
                <div className={clsx('text-xs font-medium', i.status === 'paid' ? 'text-emerald-600' : i.overdue ? 'text-rose-600' : i.status === 'void' ? 'text-slate-400' : 'text-sky-600')}>
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
  const { data, reload } = usePortal<{ company: CompanySettings; invoice: Omit<InvoiceDetail, 'job'> & { job: { number: string; title: string; address: string | null } | null } }>(`/portal/invoices/${id}`);
  if (!data) return <div className="text-slate-400">Loading…</div>;
  const inv = data.invoice;
  return (
    <>
      <Link to="/portal/invoices" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← All invoices
      </Link>
      {inv.status === 'sent' && inv.balance > 0 && <PayPanel invoiceId={inv.id} balance={inv.balance} onPaid={reload} />}
      <InvoiceDocument invoice={inv} company={data.company} />
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
      const res = await papi<{ requiresAction: boolean; clientSecret?: string }>(`/portal/invoices/${invoiceId}/pay`, { method: 'POST', body: { paymentMethodId: selected } });
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


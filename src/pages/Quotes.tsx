import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2, FileSignature, Mail, Phone, Plus, Send, ThumbsDown, Trash2, Undo2, Wrench } from 'lucide-react';
import { api, del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { dateTime, money, relative, shortDate } from '../format';
import { Button, DivisionBadge, EmptyState, Modal, PageHeader } from '../components/ui';
import { ChainBar } from '../components/Chain';
import { NotesFeed } from '../components/NotesFeed';
import { TextClientButton } from '../components/TextClient';
import { StatusPill } from './Requests';
import { QUOTE_STATUS_META, type Chain, type Client, type Job, type Quote, type QuoteDetail, type QuoteItem, type QuoteStatus } from '../../shared/types';

const TABS: { key: string; label: string; match: (s: QuoteStatus) => boolean }[] = [
  { key: 'waiting', label: 'Awaiting approval', match: (s) => s === 'sent' || s === 'changes_requested' },
  { key: 'approved', label: 'Approved', match: (s) => s === 'approved' },
  { key: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { key: 'converted', label: 'Converted', match: (s) => s === 'converted' },
  { key: 'declined', label: 'Declined', match: (s) => s === 'declined' },
  { key: 'all', label: 'All', match: () => true },
];

export function Quotes() {
  const app = useApp();
  const navigate = useNavigate();
  const { data: quotes } = useApi<Quote[]>(`/quotes${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const [tab, setTab] = useState('waiting');
  const [creating, setCreating] = useState(false);
  const clientName = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c.name])), [clients]);
  const shown = (quotes ?? []).filter((q) => TABS.find((t) => t.key === tab)!.match(q.status));
  const money$ = app.can('view_financials');

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Price the work, send it for approval and signature, then convert it to a job. Quotes stay on the client's account after they become jobs."
        actions={
          app.can('manage_jobs') && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> New quote
            </Button>
          )
        }
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const n = (quotes ?? []).filter((q) => t.match(q.status)).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
                tab === t.key ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              {t.label} <span className="text-slate-400">{n}</span>
            </button>
          );
        })}
      </div>
      {!quotes ? (
        <div className="card h-40 animate-pulse" />
      ) : !shown.length ? (
        <EmptyState>{tab === 'approved' ? 'No approved quotes waiting to become jobs.' : 'Nothing here.'}</EmptyState>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quote</th>
                <th className="px-3 font-medium">Client</th>
                <th className="px-3 font-medium">Status</th>
                {money$ && <th className="px-3 text-right font-medium">Total</th>}
                <th className="px-4 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.id} onClick={() => navigate(`/quotes/${q.id}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: app.division(q.divisionId)?.color }} />
                      <span className="font-medium">{q.title}</span>
                    </div>
                    <div className="pl-4 font-mono text-xs text-slate-400">{q.number}</div>
                  </td>
                  <td className="px-3">{clientName.get(q.clientId)}</td>
                  <td className="px-3">
                    <StatusPill meta={QUOTE_STATUS_META[q.status]} />
                    {q.status === 'sent' && q.followupCount > 0 && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {q.followupCount} follow-up text{q.followupCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  {money$ && <td className="px-3 text-right tabular-nums">{money(q.total)}</td>}
                  <td className="px-4 text-right text-slate-500">{relative(q.approvedAt ?? q.sentAt ?? q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {creating && <NewQuote onClose={() => setCreating(false)} />}
    </div>
  );
}

/** A quote without a request, e.g. priced over the phone. */
export function NewQuote({ onClose, clientId }: { onClose: () => void; clientId?: number }) {
  const app = useApp();
  const navigate = useNavigate();
  const { data: clients } = useApi<Client[]>('/clients');
  const [form, setForm] = useState({
    divisionId: app.divisionId ?? app.divisions[0]?.id,
    clientId: clientId ?? ('' as number | ''),
    title: '',
    description: '',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const q = await post<Quote>('/quotes', form);
      onClose();
      navigate(`/quotes/${q.id}`);
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  return (
    <Modal title="New quote" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">Most quotes start from a request (Requests → Convert to quote). Use this when you're quoting without one.</p>
        <label className="block">
          <span className="label">Division</span>
          <select className="input" value={form.divisionId} onChange={(e) => setForm({ ...form, divisionId: Number(e.target.value) })}>
            {app.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Client</span>
          <select className="input" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: Number(e.target.value) })}>
            <option value="">Select a client…</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Title</span>
          <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Create quote</Button>
        </div>
      </form>
    </Modal>
  );
}

type Detail = QuoteDetail & { chain: Chain; defaultDepositPercent: number };

export function QuoteDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const { data: q, setData } = useApi<Detail>(`/quotes/${id}`);
  const { data: activity, reload: reloadActivity } = useApi<{ id: number; message: string; created_at: string }[]>(`/quotes/${id}/activity`);
  const [chainRev, setChainRev] = useState(0);
  if (!q) return <div className="text-slate-400">Loading quote…</div>;
  const canManage = app.can('manage_jobs');
  const editable = canManage && !['approved', 'converted'].includes(q.status);
  const pct = q.depositPercent ?? q.defaultDepositPercent;

  async function run(fn: () => Promise<QuoteDetail>, message?: string) {
    try {
      const next = await fn();
      setData({ ...q!, ...next, chain: await api<Chain>(`/quotes/${q!.id}/chain`) });
      setChainRev((n) => n + 1);
      reloadActivity();
      if (message) app.toast(message);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  async function toJob() {
    try {
      const job = await post<Job & { automations?: string[] }>(`/quotes/${q!.id}/job`, {});
      app.toast(`${q!.number} converted to job ${job.number}`);
      app.announce(job);
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link to="/quotes" className="hover:text-brand-600">
              <FileSignature size={14} className="mr-1 inline" />
              Quotes
            </Link>
            <span>/</span>
            <span className="font-mono">{q.number}</span>
            <DivisionBadge division={app.division(q.divisionId)} />
            <StatusPill meta={QUOTE_STATUS_META[q.status]} />
          </div>
          <input
            key={q.title}
            defaultValue={q.title}
            disabled={!editable}
            onBlur={(e) => e.target.value.trim() && e.target.value !== q.title && run(() => patch(`/quotes/${q.id}`, { title: e.target.value.trim() }))}
            className="-ml-1 w-full rounded bg-transparent px-1 text-2xl font-bold tracking-tight outline-none hover:bg-white focus:bg-white"
          />
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {(q.status === 'draft' || q.status === 'changes_requested') && (
              <Button onClick={() => run(() => post(`/quotes/${q.id}/send`, {}), 'Quote sent. The client can approve and sign it in their portal.')}>
                <Send size={16} /> {q.status === 'draft' ? 'Send to client' : 'Re-send updated quote'}
              </Button>
            )}
            {['draft', 'sent', 'changes_requested'].includes(q.status) && (
              <Button
                variant="secondary"
                onClick={() =>
                  confirm('Record that the client approved this quote (by phone, email or on paper)?') &&
                  run(() => post(`/quotes/${q.id}/approve`, {}), 'Approval recorded')
                }
              >
                <CheckCircle2 size={16} /> Record approval
              </Button>
            )}
            {q.status === 'approved' && (
              <Button onClick={toJob}>
                <Wrench size={16} /> Convert to job <ArrowRight size={14} />
              </Button>
            )}
            {['sent', 'changes_requested'].includes(q.status) && (
              <Button variant="ghost" onClick={() => run(() => patch(`/quotes/${q.id}`, { status: 'declined' }), 'Marked declined')}>
                <ThumbsDown size={16} /> Declined
              </Button>
            )}
            {q.status === 'declined' && (
              <Button variant="secondary" onClick={() => run(() => patch(`/quotes/${q.id}`, { status: 'draft' }))}>
                <Undo2 size={16} /> Reopen
              </Button>
            )}
            {q.status === 'draft' && (
              <Button
                variant="danger"
                title="Delete draft"
                onClick={async () => {
                  if (!confirm('Delete this draft quote?')) return;
                  await del(`/quotes/${q.id}`);
                  navigate(q.requestId ? `/requests/${q.requestId}` : '/quotes');
                }}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <ChainBar key={chainRev} kind="quote" id={q.id} chain={q.chain} />
      </div>

      {q.status === 'approved' && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          <span>
            {q.approvedBy === 'client' ? (
              <>
                <b>{q.signerName}</b> approved and signed this quote in the customer portal
              </>
            ) : (
              <>
                Approval recorded by <b>{q.approvedBy}</b>
              </>
            )}{' '}
            on {shortDate(q.approvedAt!.slice(0, 10))}. Convert it to a job to schedule the work.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Scope of work</h2>
            <textarea
              key={q.description}
              className="input"
              rows={4}
              disabled={!editable}
              defaultValue={q.description}
              placeholder="What's included (the client sees this)"
              onBlur={(e) => e.target.value !== q.description && run(() => patch(`/quotes/${q.id}`, { description: e.target.value }))}
            />
          </section>

          <QuoteItems q={q} editable={editable} onChange={(next) => run(async () => next)} />

          <section className="card p-5">
            <h2 className="font-semibold">Notes & photos</h2>
            <p className="mb-4 text-xs text-slate-500">Includes notes and photos from the request. Shared notes are visible to the client in their portal.</p>
            <NotesFeed stage="quote" id={q.id} chain />
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Client</h2>
            <Link to={`/clients/${q.client.id}`} className="font-medium hover:text-brand-600">
              {q.client.name}
            </Link>
            <div className="mt-1 space-y-1 text-sm text-slate-600">
              {q.address && <div>{q.address}</div>}
              {q.client.phone && (
                <a href={`tel:${q.client.phone}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Phone size={13} /> {q.client.phone}
                </a>
              )}
              {q.client.email && (
                <a href={`mailto:${q.client.email}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Mail size={13} /> {q.client.email}
                </a>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {q.client.phone && (
                <a
                  href={`tel:${q.client.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <Phone size={15} /> Call
                </a>
              )}
              {q.status !== 'draft' && <TextClientButton job={{ stage: 'quote', id: q.id }} onSent={reloadActivity} />}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-2 font-semibold">Approval & deposit</h2>
            <label className="block">
              <span className="label">Deposit when approved</span>
              <div className="flex items-center gap-2">
                <input
                  key={String(q.depositPercent)}
                  type="number"
                  min={0}
                  max={100}
                  className="input w-24"
                  disabled={!editable}
                  defaultValue={q.depositPercent ?? ''}
                  placeholder={String(q.defaultDepositPercent)}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== q.depositPercent) run(() => patch(`/quotes/${q.id}`, { depositPercent: v }));
                  }}
                />
                <span className="text-sm text-slate-500">% {q.depositPercent == null && '(company default)'}</span>
              </div>
            </label>
            {pct > 0 && q.total > 0 && (
              <p className="mt-1 text-xs text-slate-500">Deposit of {money((q.total * pct) / 100)} is invoiced as soon as it's approved.</p>
            )}
            {q.signature && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <div className="text-xs text-slate-500">Signed by {q.signerName}</div>
                <img src={q.signature} alt={`Signature of ${q.signerName}`} className="mt-1 h-20 w-full object-contain" />
                <div className="text-xs text-slate-500">{q.approvedAt && dateTime(q.approvedAt)}</div>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">
              {q.status === 'sent' && 'Waiting on the client. They get a daily follow-up text (if turned on in Settings) until they approve.'}
              {q.status === 'changes_requested' && 'The client asked for changes (see notes). Update the quote and re-send it.'}
              {q.status === 'draft' && 'Not sent yet. The client can’t see drafts.'}
              {q.status === 'converted' && 'This quote became a job. It stays here as the record of what was approved.'}
            </p>
          </section>

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

function QuoteItems({ q, editable, onChange }: { q: QuoteDetail; editable: boolean; onChange: (next: QuoteDetail) => void }) {
  const app = useApp();
  const [draft, setDraft] = useState({ description: '', quantity: '1', unitPrice: '' });

  async function act(fn: () => Promise<QuoteDetail>) {
    try {
      onChange(await fn());
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await act(() => post(`/quotes/${q.id}/items`, { description: draft.description, quantity: Number(draft.quantity), unitPrice: Number(draft.unitPrice) }));
    setDraft({ description: '', quantity: '1', unitPrice: '' });
  }

  const edit = (item: QuoteItem, changes: Partial<QuoteItem>) => act(() => patch(`/quote-items/${item.id}`, changes));

  return (
    <section className="card p-5">
      <h2 className="mb-3 font-semibold">Line items</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-1 font-medium">Description</th>
              <th className="w-20 pb-1 text-right font-medium">Qty</th>
              <th className="w-28 pb-1 text-right font-medium">Price</th>
              <th className="w-28 pb-1 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {q.items.map((i) => (
              <tr key={i.id} className="group border-t border-slate-100">
                <td className="py-1">
                  <input
                    className="w-full rounded bg-transparent px-1 py-1 outline-none hover:bg-slate-50 focus:bg-white"
                    defaultValue={i.description}
                    disabled={!editable}
                    onBlur={(e) => e.target.value !== i.description && edit(i, { description: e.target.value })}
                  />
                </td>
                <td className="text-right">
                  <input
                    className="w-16 rounded bg-transparent px-1 py-1 text-right outline-none hover:bg-slate-50 focus:bg-white"
                    type="number"
                    step="any"
                    defaultValue={i.quantity}
                    disabled={!editable}
                    onBlur={(e) => Number(e.target.value) !== i.quantity && edit(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="text-right">
                  <input
                    className="w-24 rounded bg-transparent px-1 py-1 text-right outline-none hover:bg-slate-50 focus:bg-white"
                    type="number"
                    step="0.01"
                    defaultValue={i.unitPrice}
                    disabled={!editable}
                    onBlur={(e) => Number(e.target.value) !== i.unitPrice && edit(i, { unitPrice: Number(e.target.value) })}
                  />
                </td>
                <td className="text-right font-medium">{money(i.quantity * i.unitPrice)}</td>
                <td className="text-right">
                  {editable && (
                    <button
                      className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                      onClick={() => act(() => api(`/quote-items/${i.id}`, { method: 'DELETE' }))}
                      aria-label="Remove line"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="py-2 text-right font-semibold">
                Total
              </td>
              <td className="py-2 text-right text-base font-bold">{money(q.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {editable && (
        <form onSubmit={add} className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_110px_auto]">
          <input
            id="quote-item-description"
            className="input"
            required
            placeholder="Add a line item"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <input
            className="input"
            type="number"
            step="any"
            placeholder="Qty"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          />
          <input
            id="quote-item-price"
            className="input"
            type="number"
            step="0.01"
            required
            placeholder="$ price"
            value={draft.unitPrice}
            onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
          />
          <Button variant="secondary">
            <Plus size={16} /> Add
          </Button>
        </form>
      )}
      {!q.items.length && !editable && <EmptyState>No line items.</EmptyState>}
    </section>
  );
}

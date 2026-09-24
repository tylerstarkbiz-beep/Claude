import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Copy, CreditCard, DollarSign, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { api, del, patch, post, useApi } from '../api';
import { useApp } from '../store';
import { DEMO } from '../env';
import { money, shortDate, todayISO } from '../format';
import { Button, Modal, Pill } from '../components/ui';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { invoiceBadge } from './Invoices';
import { PAYMENT_METHODS, type CompanySettings, type InvoiceDetail, type InvoiceItem } from '../../shared/types';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const { data: inv, setData } = useApi<InvoiceDetail>(`/invoices/${id}`);
  const { data: company } = useApi<CompanySettings>('/settings/company');
  const [paying, setPaying] = useState(false);
  const [charging, setCharging] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', quantity: '1', unitPrice: '' });

  if (!inv || !company) return <div className="text-slate-400">Loading…</div>;
  const editable = (inv.status === 'draft' || inv.status === 'sent') && app.can('manage_invoices');
  const badge = invoiceBadge(inv);
  const clientLink = DEMO ? `(demo) /pay/${inv.publicToken}` : `${location.origin}/pay/${inv.publicToken}`;

  const run = async (p: Promise<InvoiceDetail & { automations?: string[] }>, msg?: string) => {
    try {
      const res = await p;
      setData(res);
      app.announce(res);
      if (msg) app.toast(msg);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  };

  const editItem = (it: InvoiceItem, changes: Partial<InvoiceItem>) => run(patch(`/invoice-items/${it.id}`, changes));
  const addItem = () => {
    if (!newItem.description.trim()) return;
    run(post(`/invoices/${inv.id}/items`, newItem));
    setNewItem({ description: '', quantity: '1', unitPrice: '' });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/invoices" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Invoices
      </Link>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{inv.number}</h1>
          <Pill label={badge.label} color={badge.color} />
          {inv.job && (
            <Link to={`/jobs/${inv.job.id}`} className="text-sm text-brand-600 hover:underline">
              {inv.job.number}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {inv.status === 'draft' && app.can('manage_invoices') && (
            <Button onClick={() => run(post(`/invoices/${inv.id}/send`, {}), `${inv.number} marked as sent`)}>
              <Send size={16} /> Mark as sent
            </Button>
          )}
          {inv.status === 'sent' && app.can('manage_invoices') && (
            <Button onClick={() => setPaying(true)}>
              <DollarSign size={16} /> Record payment
            </Button>
          )}
          {inv.status === 'sent' && app.can('manage_invoices') && <ChargeCardButton invoice={inv} open={charging} setOpen={setCharging} onPaid={(res) => (setData(res), app.announce(res))} />}
          {!DEMO && (<Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} /> Print / PDF
          </Button>)}
          {inv.status !== 'draft' && inv.status !== 'void' && (
            <Button variant="secondary" onClick={() =>
                navigator.clipboard
                  .writeText(clientLink)
                  .then(() => app.toast('Client link copied'))
                  .catch(() => app.toast(`Client link: ${clientLink}`))
              }>
              <Copy size={16} /> Client link
            </Button>
          )}
          {inv.status === 'sent' && inv.amountPaid === 0 && app.can('manage_invoices') && (
            <Button variant="danger" onClick={() => confirm(`Void ${inv.number}?`) && run(post(`/invoices/${inv.id}/void`, {}))}>
              <Ban size={16} /> Void
            </Button>
          )}
          {inv.status === 'draft' && app.can('manage_invoices') && (
            <Button variant="danger" onClick={async () => confirm('Delete this draft?') && (await del(`/invoices/${inv.id}`), navigate('/invoices'))}>
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>

      {editable && (
        <div className="no-print card mb-4 grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <span className="label">Issued</span>
            <input type="date" className="input" value={inv.issueDate} onChange={(e) => run(patch(`/invoices/${inv.id}`, { issueDate: e.target.value }))} />
          </div>
          <div>
            <span className="label">Due</span>
            <input type="date" className="input" value={inv.dueDate} onChange={(e) => run(patch(`/invoices/${inv.id}`, { dueDate: e.target.value }))} />
          </div>
          <div>
            <span className="label">Tax %</span>
            <input
              type="number"
              step="any"
              min={0}
              className="input"
              defaultValue={inv.taxRate}
              onBlur={(e) => Number(e.target.value) !== inv.taxRate && run(patch(`/invoices/${inv.id}`, { taxRate: Number(e.target.value) }))}
            />
          </div>
          <div>
            <span className="label">Message to client</span>
            <input
              className="input"
              defaultValue={inv.notes ?? ''}
              placeholder="Optional"
              onBlur={(e) => e.target.value !== (inv.notes ?? '') && run(patch(`/invoices/${inv.id}`, { notes: e.target.value }))}
            />
          </div>
        </div>
      )}

      <InvoiceDocument
        invoice={inv}
        company={company}
        onEditItem={editable ? editItem : undefined}
        onDeleteItem={editable ? (it) => run(api(`/invoice-items/${it.id}`, { method: 'DELETE' })) : undefined}
        footer={
          editable && (
            <div className="no-print mt-2 grid grid-cols-[1fr_70px_100px_auto] gap-2">
              <input className="input" placeholder="Add line item…" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
              <input className="input" type="number" step="any" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
              <input className="input" type="number" step="any" placeholder="Price" value={newItem.unitPrice} onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
              <Button variant="secondary" onClick={addItem} aria-label="Add line item">
                <Plus size={16} />
              </Button>
            </div>
          )
        }
      />

      {inv.payments.length > 0 && (
        <section className="no-print card mt-4 p-5">
          <h2 className="mb-3 font-semibold">Payments</h2>
          {inv.payments.map((p) => (
            <div key={p.id} className="group flex items-center gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="w-20 text-slate-500">{shortDate(p.paidOn)}</span>
              <span className="w-20">{p.method}</span>
              <span className="flex-1 text-slate-500">{p.note}</span>
              <span className="font-medium">{money(p.amount)}</span>
              <button
                className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                onClick={() => confirm('Remove this payment?') && run(api(`/payments/${p.id}`, { method: 'DELETE' }))}
                aria-label="Remove payment"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>
      )}

      {paying && <PaymentForm invoice={inv} onClose={() => setPaying(false)} onSaved={(res) => (setData(res), app.announce(res), setPaying(false))} />}
    </div>
  );
}

function PaymentForm({ invoice, onClose, onSaved }: { invoice: InvoiceDetail; onClose: () => void; onSaved: (inv: InvoiceDetail & { automations?: string[] }) => void }) {
  const app = useApp();
  const [form, setForm] = useState({ amount: String(invoice.balance), method: 'Card', paidOn: todayISO(), note: '' });
  return (
    <Modal title={`Record payment on ${invoice.number}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onSaved(await post(`/invoices/${invoice.id}/payments`, { ...form, amount: Number(form.amount) }));
          } catch (err) {
            app.toast((err as Error).message, 'error');
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label">Amount (balance {money(invoice.balance)})</span>
            <input className="input" type="number" step="0.01" min="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <span className="label">Method</span>
            <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Date received</span>
            <input className="input" type="date" required value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
          </div>
          <div>
            <span className="label">Reference</span>
            <input className="input" placeholder="Check #, last 4…" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Record payment</Button>
        </div>
      </form>
    </Modal>
  );
}

type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean };

/** Charge the balance to a card the client saved in their portal. Only shows when they have one. */
function ChargeCardButton({
  invoice,
  open,
  setOpen,
  onPaid,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  setOpen: (v: boolean) => void;
  onPaid: (res: InvoiceDetail & { automations?: string[] }) => void;
}) {
  const app = useApp();
  const { data } = useApi<{ enabled: boolean; cards: SavedCard[] }>(`/clients/${invoice.clientId}/cards`);
  const [cardId, setCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data?.enabled || !data.cards.length) return null;
  const selected = cardId ?? data.cards.find((c) => c.isDefault)?.id ?? data.cards[0].id;

  async function charge() {
    setBusy(true);
    try {
      const res = await post<InvoiceDetail & { automations?: string[] }>(`/invoices/${invoice.id}/charge`, { paymentMethodId: selected });
      onPaid(res);
      app.toast(`Charged ${money(invoice.balance)} to the card on file`);
      setOpen(false);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CreditCard size={16} /> Charge card on file
      </Button>
      {open && (
        <Modal title={`Charge ${invoice.number}`} onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-slate-600">
            Charge <b>{money(invoice.balance)}</b> to {invoice.client.name}'s saved card. They saved it in their customer portal and agreed to charges for
            completed work.
          </p>
          <select id="charge-card" className="input mb-4" value={selected} onChange={(e) => setCardId(e.target.value)}>
            {data.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brand.toUpperCase()} •••• {c.last4} (exp {String(c.expMonth).padStart(2, '0')}/{c.expYear})
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={charge} disabled={busy}>
              {busy ? 'Charging…' : `Charge ${money(invoice.balance)}`}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { post, useApi } from '../api';
import { useApp } from '../store';
import { money, shortDate, todayISO } from '../format';
import { Button, DivisionBadge, EmptyState, Modal, PageHeader, Pill } from '../components/ui';
import { INVOICE_STATUS_META, type Client, type Invoice, type InvoiceDetail } from '../../shared/types';

export const invoiceBadge = (i: Invoice) => INVOICE_STATUS_META[i.overdue ? 'overdue' : i.status];

const FILTERS = [
  ['all', 'All'],
  ['draft', 'Drafts'],
  ['unpaid', 'Awaiting payment'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
] as const;

export function Invoices() {
  const app = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [creating, setCreating] = useState(false);
  const { data } = useApi<Invoice[]>(`/invoices${app.divisionId ? `?divisionId=${app.divisionId}` : ''}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const clientName = (id: number) => clients?.find((c) => c.id === id)?.name;

  const all = data ?? [];
  const list = all.filter(
    (i) =>
      filter === 'all' ||
      (filter === 'draft' && i.status === 'draft') ||
      (filter === 'unpaid' && i.status === 'sent') ||
      (filter === 'overdue' && i.overdue) ||
      (filter === 'paid' && i.status === 'paid'),
  );
  const outstanding = all.filter((i) => i.status === 'sent').reduce((a, i) => a + i.balance, 0);
  const overdue = all.filter((i) => i.overdue).reduce((a, i) => a + i.balance, 0);
  const month = todayISO().slice(0, 7);
  const paidMonth = all.filter((i) => i.status === 'paid' && i.issueDate.startsWith(month)).reduce((a, i) => a + i.total, 0);
  const drafts = all.filter((i) => i.status === 'draft').length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Invoices"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> New invoice
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Awaiting payment" value={money(outstanding)} />
        <Kpi label="Overdue" value={money(overdue)} alert={overdue > 0} />
        <Kpi label="Paid (invoiced this month)" value={money(paidMonth)} />
        <Kpi label="Drafts to send" value={drafts} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={clsx('rounded-full px-3 py-1.5 text-sm', filter === k ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >
            {label}
          </button>
        ))}
      </div>

      {!list.length ? (
        <EmptyState>No invoices here.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Division</th>
                <th className="px-4 py-3">Issued</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const b = invoiceBadge(i);
                return (
                  <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link to={`/invoices/${i.id}`}>{i.number}</Link>
                      {i.kind === 'deposit' && <span className="ml-1.5 rounded bg-brand-50 px-1 font-sans text-[10px] font-medium text-brand-700">Deposit</span>}
                    </td>
                    <td className="px-4 py-3">{clientName(i.clientId)}</td>
                    <td className="px-4 py-3">
                      <DivisionBadge division={app.division(i.divisionId)} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{shortDate(i.issueDate)}</td>
                    <td className={clsx('px-4 py-3', i.overdue ? 'font-medium text-rose-600' : 'text-slate-600')}>{shortDate(i.dueDate)}</td>
                    <td className="px-4 py-3">
                      <Pill label={b.label} color={b.color} />
                    </td>
                    <td className="px-4 py-3 text-right">{money(i.total)}</td>
                    <td className="px-4 py-3 text-right font-medium">{money(i.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <Modal title="New invoice" onClose={() => setCreating(false)}>
          <p className="mb-3 text-sm text-slate-500">
            Most invoices start from a job: open the job and click <b>Create invoice</b> to copy its line items. You can also start a blank invoice for a client.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const clientId = Number(new FormData(e.currentTarget).get('clientId'));
              const inv = await post<InvoiceDetail>('/invoices', { clientId, divisionId: app.divisionId });
              navigate(`/invoices/${inv.id}`);
            }}
            className="flex gap-2"
          >
            <select name="clientId" required className="input">
              <option value="">Select a client…</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button>Create</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={clsx('mt-1 text-2xl font-bold', alert && 'text-rose-600')}>{value}</div>
    </div>
  );
}

import { Trash2 } from 'lucide-react';
import { money, shortDate } from '../format';
import type { CompanySettings, InvoiceDetail, InvoiceItem } from '../../shared/types';

const cellInput = 'w-full rounded bg-transparent px-1 py-0.5 outline-none hover:bg-slate-50 focus:bg-brand-50 print:hover:bg-transparent';

/** The invoice as the client sees it; editable inline when `onEditItem` is passed. */
export function InvoiceDocument({
  invoice,
  company,
  onEditItem,
  onDeleteItem,
  footer,
}: {
  invoice: Pick<
    InvoiceDetail,
    'number' | 'issueDate' | 'dueDate' | 'items' | 'subtotal' | 'tax' | 'taxRate' | 'total' | 'amountPaid' | 'balance' | 'notes' | 'client' | 'status'
  > & {
    job: { number: string; title: string; address: string | null } | null;
  };
  company: CompanySettings;
  onEditItem?: (item: InvoiceItem, changes: Partial<InvoiceItem>) => void;
  onDeleteItem?: (item: InvoiceItem) => void;
  footer?: React.ReactNode;
}) {
  const editable = !!onEditItem;
  return (
    <div className="print-area card border-t-4 border-t-brand-600 p-6 sm:p-10">
      <div className="mb-8 flex flex-wrap justify-between gap-6">
        <div className="flex flex-wrap items-start gap-4">
          {company.logo && <img src={company.logo} alt={company.name} className="h-24 w-auto max-w-[180px] object-contain" />}
          <div>
            <div className="text-xl font-bold text-brand-600">{company.name}</div>
            <div className="mt-1 whitespace-pre-line text-sm text-slate-500">{[company.address, company.phone, company.email].filter(Boolean).join('\n')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-light tracking-wide text-brand-600">INVOICE</div>
          <div className="mt-1 font-mono text-sm">{invoice.number}</div>
          {invoice.status === 'paid' && (
            <div className="mt-2 inline-block rounded border-2 border-emerald-600 px-2 text-sm font-bold text-emerald-600">PAID</div>
          )}
          {invoice.status === 'void' && <div className="mt-2 inline-block rounded border-2 border-slate-500 px-2 text-sm font-bold text-slate-500">VOID</div>}
        </div>
      </div>

      <div className="mb-8 grid gap-6 text-sm sm:grid-cols-3">
        <div>
          <div className="label">Bill to</div>
          <div className="font-medium">{invoice.client.name}</div>
          {invoice.client.company && <div>{invoice.client.company}</div>}
          <div className="text-slate-600">{invoice.client.address}</div>
          <div className="text-slate-600">{invoice.client.email}</div>
        </div>
        {invoice.job && (
          <div>
            <div className="label">For</div>
            <div className="font-medium">{invoice.job.title}</div>
            <div className="text-slate-600">{invoice.job.address}</div>
            <div className="font-mono text-xs text-slate-400">{invoice.job.number}</div>
          </div>
        )}
        <div className="sm:text-right">
          <div className="label">Issued</div>
          <div>
            {shortDate(invoice.issueDate)}, {invoice.issueDate.slice(0, 4)}
          </div>
          <div className="label mt-2">Due</div>
          <div className="font-medium">
            {shortDate(invoice.dueDate)}, {invoice.dueDate.slice(0, 4)}
          </div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b-2 border-brand-600 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2">Description</th>
            <th className="w-16 py-2 text-right">Qty</th>
            <th className="w-24 py-2 text-right">Price</th>
            <th className="w-28 py-2 text-right">Amount</th>
            {editable && <th className="no-print w-6" />}
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it) => (
            <tr key={it.id} className="group border-b border-slate-100">
              <td className="py-2 pr-2">
                {editable ? (
                  <input
                    className={cellInput}
                    defaultValue={it.description}
                    onBlur={(e) => e.target.value !== it.description && onEditItem!(it, { description: e.target.value })}
                  />
                ) : (
                  it.description
                )}
              </td>
              <td className="py-2 text-right">
                {editable ? (
                  <input
                    type="number"
                    step="any"
                    className={cellInput + ' text-right'}
                    defaultValue={it.quantity}
                    onBlur={(e) => Number(e.target.value) !== it.quantity && onEditItem!(it, { quantity: Number(e.target.value) })}
                  />
                ) : (
                  it.quantity
                )}
              </td>
              <td className="py-2 text-right">
                {editable ? (
                  <input
                    type="number"
                    step="any"
                    className={cellInput + ' text-right'}
                    defaultValue={it.unitPrice}
                    onBlur={(e) => Number(e.target.value) !== it.unitPrice && onEditItem!(it, { unitPrice: Number(e.target.value) })}
                  />
                ) : (
                  money(it.unitPrice)
                )}
              </td>
              <td className="py-2 text-right font-medium">{money(it.quantity * it.unitPrice)}</td>
              {editable && (
                <td className="no-print text-right">
                  <button
                    className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                    onClick={() => onDeleteItem?.(it)}
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {footer}

      <div className="mt-6 ml-auto w-full max-w-xs space-y-1 text-sm">
        <Row label="Subtotal" value={money(invoice.subtotal)} />
        {invoice.taxRate > 0 && <Row label={`Tax (${invoice.taxRate}%)`} value={money(invoice.tax)} />}
        <Row label="Total" value={money(invoice.total)} bold />
        {invoice.amountPaid > 0 && <Row label="Paid" value={`−${money(invoice.amountPaid)}`} />}
        <div className="mt-2 flex justify-between border-t-2 border-brand-600 pt-2 text-base font-bold text-brand-700">
          <span>Balance due</span>
          <span>{money(invoice.balance)}</span>
        </div>
      </div>

      {(invoice.notes || company.invoiceFooter) && (
        <div className="mt-10 border-t border-slate-200 pt-4 text-sm whitespace-pre-line text-slate-500">
          {invoice.notes && <p className="mb-2 text-slate-700">{invoice.notes}</p>}
          {company.invoiceFooter}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={'flex justify-between ' + (bold ? 'font-semibold' : 'text-slate-600')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

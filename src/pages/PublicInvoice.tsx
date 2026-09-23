import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useApi } from '../api';
import { Button } from '../components/ui';
import { InvoiceDocument } from '../components/InvoiceDocument';
import type { CompanySettings, InvoiceDetail } from '../../shared/types';

type PublicInvoice = { company: CompanySettings; invoice: Omit<InvoiceDetail, 'job'> & { job: { number: string; title: string; address: string | null } | null } };

/** What a client sees when they open their invoice link. No app chrome, no login. */
export function PublicInvoicePage() {
  const { token } = useParams();
  const { data, error } = useApi<PublicInvoice>(`/public/invoices/${token}`);
  if (error) return <div className="grid h-full place-items-center text-slate-500">This invoice link is not valid.</div>;
  if (!data) return <div className="grid h-full place-items-center text-slate-400">Loading…</div>;
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="no-print mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} /> Print / save PDF
        </Button>
      </div>
      <InvoiceDocument invoice={data.invoice} company={data.company} />
      {data.invoice.balance > 0 && data.invoice.status !== 'void' && (
        <p className="no-print mt-4 text-center text-sm text-slate-500">
          To pay, contact {data.company.name}
          {data.company.phone && ` at ${data.company.phone}`}.
        </p>
      )}
    </div>
  );
}

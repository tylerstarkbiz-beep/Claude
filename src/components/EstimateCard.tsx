import { Link } from 'react-router-dom';
import { CheckCircle2, FileSignature } from 'lucide-react';
import { patch, useApi } from '../api';
import { useApp } from '../store';
import { money, shortDate } from '../format';
import type { Job } from '../../shared/types';

interface EstimateInfo {
  signature: { name: string; image: string; total: number; ip: string | null; signedAt: string } | null;
  deposit: { invoiceId: number; number: string; amount: number; balance: number; status: string } | null;
  defaultDepositPercent: number;
}

/** Estimate approval: deposit setting, the client's signature, deposit status, and follow-up texts. */
export function EstimateCard({ job, onChange }: { job: Job; onChange: () => void }) {
  const app = useApp();
  const { data } = useApi<EstimateInfo>(`/jobs/${job.id}/estimate?r=${job.approvedAt ?? ''}`);
  if (!data || (job.status !== 'quoted' && !data.signature)) return null;
  const pct = job.depositPercent ?? data.defaultDepositPercent;

  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <FileSignature size={18} className="text-brand-600" /> Estimate approval
      </h2>
      {data.signature ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-emerald-700">
            <CheckCircle2 size={16} /> Approved and signed {shortDate(data.signature.signedAt.slice(0, 10))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <img src={data.signature.image} alt={`Signature of ${data.signature.name}`} className="h-20 w-full object-contain" />
            <div className="border-t border-slate-200 pt-1 text-center text-xs text-slate-500">
              {data.signature.name} · {new Date(data.signature.signedAt).toLocaleString()} · {money(data.signature.total)}
              {data.signature.ip && ` · IP ${data.signature.ip}`}
            </div>
          </div>
          {data.deposit && (
            <Link to={`/invoices/${data.deposit.invoiceId}`} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 hover:bg-slate-100">
              <span>
                Deposit {data.deposit.number} · {money(data.deposit.amount)}
              </span>
              <span className={data.deposit.status === 'paid' ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
                {data.deposit.status === 'paid' ? 'Paid' : `${money(data.deposit.balance)} due`}
              </span>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          <p>Waiting for the client to approve and sign in their portal.</p>
          <label className="flex items-center gap-2">
            Deposit when approved
            <input
              id="deposit-percent"
              type="number"
              min={0}
              max={100}
              className="input w-20"
              defaultValue={pct}
              key={pct}
              onBlur={async (e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                if (v === pct) return;
                await patch(`/jobs/${job.id}`, { depositPercent: v });
                onChange();
              }}
            />
            % {job.total > 0 && pct > 0 && <span className="text-slate-500">= {money((job.total * pct) / 100)}</span>}
          </label>
          {app.company.quoteFollowUps && (
            <p className="text-xs text-slate-500">
              Daily follow-up texts: {job.followupCount} of {app.company.quoteFollowUpDays} sent. They stop when the client approves.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

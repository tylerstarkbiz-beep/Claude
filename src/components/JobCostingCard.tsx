import { useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { api, post, useApi } from '../api';
import { useApp } from '../store';
import { hm, money, shortDate, todayISO } from '../format';
import { Avatar, Button } from './ui';
import { COST_CATEGORIES, type JobCosting } from '../../shared/types';

export const marginColor = (m: number | null) => (m == null ? 'text-slate-400' : m < 0 ? 'text-rose-600' : m < 20 ? 'text-amber-600' : 'text-emerald-600');

/** Revenue vs. labor and entered costs for one job, with the cost log. */
export function JobCostingCard({ jobId, refreshKey }: { jobId: number; refreshKey?: unknown }) {
  const app = useApp();
  const { data: c, setData } = useApi<JobCosting>(`/jobs/${jobId}/costing?r=${String(refreshKey ?? '')}`);
  const [draft, setDraft] = useState({ date: todayISO(), category: 'Materials', description: '', amount: '' });

  if (!c) return <section className="card h-40 animate-pulse" />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      setData(await post<JobCosting>(`/jobs/${jobId}/costs`, { ...draft, amount: Number(draft.amount), createdBy: app.currentUserId }));
      setDraft({ ...draft, description: '', amount: '' });
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  const pct = (n: number) => (c.revenue > 0 ? Math.max(0, Math.min(100, (n / c.revenue) * 100)) : 0);

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Job costing</h2>
        {c.invoiced > 0 && Math.abs(c.invoiced - c.revenue) > 0.009 && (
          <span className="text-xs text-slate-500">Invoiced {money(c.invoiced)} (incl. tax)</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Figure label="Revenue" value={money(c.revenue)} />
        <Figure label="Labor" value={money(c.laborCost)} sub={hm(c.laborMinutes)} />
        <Figure label="Materials & other" value={money(c.otherCosts)} />
        <Figure label="Profit" value={money(c.profit)} className={c.profit < 0 ? 'text-rose-600' : undefined} />
        <Figure label="Margin" value={c.margin == null ? '—' : `${c.margin}%`} className={marginColor(c.margin)} />
      </div>

      {c.revenue > 0 && (
        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" title="Share of revenue">
            <div className="bg-sky-500" style={{ width: `${pct(c.laborCost)}%` }} title={`Labor ${money(c.laborCost)}`} />
            <div className="bg-amber-400" style={{ width: `${pct(c.otherCosts)}%` }} title={`Other costs ${money(c.otherCosts)}`} />
            {c.profit > 0 && <div className="bg-emerald-500" style={{ width: `${pct(c.profit)}%` }} title={`Profit ${money(c.profit)}`} />}
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-slate-500">
            <Legend color="bg-sky-500" label="Labor" />
            <Legend color="bg-amber-400" label="Materials & other" />
            <Legend color="bg-emerald-500" label="Profit" />
            {c.profit < 0 && <span className="font-medium text-rose-600">Costs exceed revenue by {money(-c.profit)}</span>}
          </div>
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold">Labor</h3>
      {c.labor.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pb-1 font-medium">Who</th>
              <th className="pb-1 text-right font-medium">Hours</th>
              <th className="pb-1 text-right font-medium">Avg rate</th>
              <th className="pb-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {c.labor.map((l) => (
              <tr key={l.userId} className="border-t border-slate-100">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <Avatar user={app.user(l.userId)} size={20} /> {app.user(l.userId)?.name}
                  </span>
                </td>
                <td className="text-right">{hm(l.minutes)}</td>
                <td className="text-right text-slate-500">{l.rate ? `${money(l.rate)}/hr` : '—'}</td>
                <td className="text-right font-medium">{money(l.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">No time tracked on this job yet. Labor cost fills in automatically as the crew runs job timers.</p>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold">Materials & other costs</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <tbody className="tabular-nums">
            {c.costs.map((cost) => (
              <tr key={cost.id} className="group border-t border-slate-100">
                <td className="w-20 py-1.5 text-slate-500">{shortDate(cost.date)}</td>
                <td className="w-40">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{cost.category}</span>
                </td>
                <td>{cost.description}</td>
                <td className="w-24 text-right font-medium">{money(cost.amount)}</td>
                <td className="w-8 text-right">
                  <button
                    type="button"
                    className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                    onClick={async () => setData(await api<JobCosting>(`/job-costs/${cost.id}`, { method: 'DELETE' }))}
                    aria-label="Remove cost"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="mt-2 grid gap-2 sm:grid-cols-[130px_170px_1fr_110px_auto]">
        <input id="cost-date" className="input" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <select id="cost-category" className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {COST_CATEGORIES.map((cat) => (
            <option key={cat}>{cat}</option>
          ))}
        </select>
        <input id="cost-description" className="input" placeholder="What was it? (vendor, item, receipt #)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <input id="cost-amount" className="input" type="number" step="0.01" required placeholder="$ amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <Button variant="secondary" aria-label="Add cost">
          <Plus size={16} /> Add
        </Button>
      </form>
    </section>
  );
}

function Figure({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={clsx('text-lg font-bold tabular-nums', className)}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={clsx('h-2.5 w-2.5 rounded-sm', color)} /> {label}
    </span>
  );
}

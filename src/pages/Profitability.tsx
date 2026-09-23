import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { hm, localDate, money, shortDate } from '../format';
import { DivisionBadge, EmptyState, PageHeader } from '../components/ui';
import { marginColor } from '../components/JobCostingCard';
import type { Client, ProfitRow } from '../../shared/types';

type Period = 'month' | 'last_month' | 'quarter' | 'year' | 'all';
const PERIODS: [Period, string][] = [
  ['month', 'This month'],
  ['last_month', 'Last month'],
  ['quarter', 'Last 90 days'],
  ['year', 'This year'],
  ['all', 'All time'],
];

function range(p: Period): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === 'month') return { from: localDate(new Date(y, m, 1)) };
  if (p === 'last_month') return { from: localDate(new Date(y, m - 1, 1)), to: localDate(new Date(y, m, 0)) };
  if (p === 'quarter') return { from: localDate(new Date(y, m, now.getDate() - 90)) };
  if (p === 'year') return { from: `${y}-01-01` };
  return {};
}

type SortKey = 'completedAt' | 'revenue' | 'laborCost' | 'otherCosts' | 'profit' | 'margin';

const sumRows = (rows: ProfitRow[]) => {
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const laborCost = rows.reduce((a, r) => a + r.laborCost, 0);
  const otherCosts = rows.reduce((a, r) => a + r.otherCosts, 0);
  const profit = revenue - laborCost - otherCosts;
  return {
    revenue,
    laborCost,
    otherCosts,
    profit,
    laborMinutes: rows.reduce((a, r) => a + r.laborMinutes, 0),
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
  };
};

/** Profit and margin by job and division for completed work. */
export function Profitability() {
  const app = useApp();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('month');
  const [includeOpen, setIncludeOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'completedAt', dir: -1 });
  const q = new URLSearchParams(range(period) as Record<string, string>);
  if (app.divisionId) q.set('divisionId', String(app.divisionId));
  if (includeOpen) q.set('includeOpen', '1');
  const { data } = useApi<ProfitRow[]>(`/reports/profitability?${q}`);
  const { data: clients } = useApi<Client[]>('/clients');
  const clientName = (id: number) => clients?.find((c) => c.id === id)?.name ?? '';

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    return list.sort((a, b) => {
      const av = a[sort.key] ?? -Infinity;
      const bv = b[sort.key] ?? -Infinity;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [data, sort]);
  const t = sumRows(rows);
  const byDivision = app.divisions.map((d) => ({ division: d, rows: rows.filter((r) => r.divisionId === d.id) })).filter((x) => x.rows.length);
  const losing = rows.filter((r) => r.profit < 0).length;

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={clsx('px-3 py-3 font-medium', right && 'text-right')}>
      <button className="inline-flex items-center gap-0.5 hover:text-slate-800" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : -1 }))}>
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Profitability"
        subtitle={`${includeOpen ? 'Completed jobs plus work in progress (costs so far)' : 'Completed jobs'}${app.divisionId ? ` in ${app.division(app.divisionId)?.name}` : ''}. Revenue is the job's line items; labor is tracked time × each person's hourly cost.`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5">
          {PERIODS.map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)} className={clsx('rounded-md px-3 py-1.5 text-sm', period === p ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600')}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeOpen} onChange={(e) => setIncludeOpen(e.target.checked)} /> Include jobs in progress
        </label>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Revenue" value={money(t.revenue)} sub={`${rows.length} jobs`} />
        <Tile label="Labor" value={money(t.laborCost)} sub={hm(t.laborMinutes)} />
        <Tile label="Materials & other" value={money(t.otherCosts)} />
        <Tile label="Gross profit" value={money(t.profit)} className={t.profit < 0 ? 'text-rose-600' : undefined} />
        <Tile label="Margin" value={t.margin == null ? '—' : `${t.margin}%`} className={marginColor(t.margin)} sub={losing ? `${losing} job${losing > 1 ? 's' : ''} lost money` : undefined} />
      </div>

      {!app.divisionId && byDivision.length > 1 && (
        <section className="card mb-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Division</th>
                <th className="px-3 py-3 text-right font-medium">Jobs</th>
                <th className="px-3 py-3 text-right font-medium">Revenue</th>
                <th className="px-3 py-3 text-right font-medium">Labor</th>
                <th className="px-3 py-3 text-right font-medium">Other costs</th>
                <th className="px-3 py-3 text-right font-medium">Profit</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {byDivision.map(({ division, rows: dr }) => {
                const s = sumRows(dr);
                return (
                  <tr key={division.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => app.setDivisionId(division.id)}>
                    <td className="px-4 py-2.5">
                      <DivisionBadge division={division} />
                    </td>
                    <td className="px-3 text-right">{dr.length}</td>
                    <td className="px-3 text-right">{money(s.revenue)}</td>
                    <td className="px-3 text-right">{money(s.laborCost)}</td>
                    <td className="px-3 text-right">{money(s.otherCosts)}</td>
                    <td className={clsx('px-3 text-right font-medium', s.profit < 0 && 'text-rose-600')}>{money(s.profit)}</td>
                    <td className={clsx('px-4 text-right font-semibold', marginColor(s.margin))}>{s.margin == null ? '—' : `${s.margin}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {!data ? (
        <div className="text-slate-400">Loading…</div>
      ) : !rows.length ? (
        <EmptyState>No completed jobs in this period.</EmptyState>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm tabular-nums">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <Th k="completedAt" label="Completed" />
                <Th k="revenue" label="Revenue" right />
                <Th k="laborCost" label="Labor" right />
                <Th k="otherCosts" label="Other costs" right />
                <Th k="profit" label="Profit" right />
                <Th k="margin" label="Margin" right />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobId} onClick={() => navigate(`/jobs/${r.jobId}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: app.division(r.divisionId)?.color }} />
                      <span className="font-medium">{r.title}</span>
                    </div>
                    <div className="pl-4 text-xs text-slate-500">
                      {r.number} · {clientName(r.clientId)}
                    </div>
                  </td>
                  <td className="px-3 text-slate-600">{r.completedAt ? shortDate(r.completedAt) : <span className="text-amber-600">In progress</span>}</td>
                  <td className="px-3 text-right">{money(r.revenue)}</td>
                  <td className="px-3 text-right">
                    {money(r.laborCost)}
                    <div className="text-xs text-slate-400">{hm(r.laborMinutes)}</div>
                  </td>
                  <td className="px-3 text-right">{money(r.otherCosts)}</td>
                  <td className={clsx('px-3 text-right font-medium', r.profit < 0 && 'text-rose-600')}>{money(r.profit)}</td>
                  <td className={clsx('px-4 text-right font-semibold', marginColor(r.margin))}>{r.margin == null ? '—' : `${r.margin}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="mt-3 text-xs text-slate-500">Margin colors: green 20% and up, amber under 20%, red when the job lost money.</p>
    </div>
  );
}

function Tile({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={clsx('mt-1 text-2xl font-bold tabular-nums', className)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

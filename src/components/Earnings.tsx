// Commissions & tips: a person's monthly tracker, and the per-job card used to log them.
// The server enforces who can see and log what; these screens just mirror those rules.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { BadgeDollarSign, ChevronLeft, ChevronRight, Coins, HandCoins, Lock, Trash2 } from 'lucide-react';
import { del, post, useApi } from '../api';
import { useApp } from '../store';
import { money, shortDate, todayISO } from '../format';
import { Button, EmptyState } from './ui';
import type { Earning, EarningKind, EarningsSummary, Job } from '../../shared/types';

export const thisMonth = () => todayISO().slice(0, 7);

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const monthLabel = (month: string, style: 'long' | 'short' = 'long') => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
};

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const atNow = month >= thisMonth();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
      <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
      <button
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={atNow}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

const KIND_META: Record<EarningKind, { label: string; icon: typeof Coins }> = {
  commission: { label: 'Commission', icon: BadgeDollarSign },
  tip: { label: 'Tip', icon: HandCoins },
};

function KindChip({ kind }: { kind: EarningKind }) {
  const { label, icon: Icon } = KIND_META[kind];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        kind === 'commission' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-700',
      )}
    >
      <Icon size={12} /> {label}
    </span>
  );
}

/** Whether the current viewer may remove an entry (mirrors the server rule). */
function useCanEdit() {
  const app = useApp();
  return (e: Earning) => app.can('manage_pay') || (e.userId === app.currentUserId && e.kind === 'tip' && !e.paidOutAt);
}

/** One person's month: totals, six-month trend, and every entry. */
export function EarningsTracker({
  userId,
  month,
  onMonthChange,
  compact,
}: {
  userId: number;
  month: string;
  onMonthChange: (m: string) => void;
  compact?: boolean;
}) {
  const app = useApp();
  const manage = app.can('manage_pay');
  const self = userId === app.currentUserId;
  const { data, setData, error, reload } = useApi<EarningsSummary>(`/earnings?userId=${userId}&month=${month}&as=${app.currentUserId}`);
  const canEdit = useCanEdit();
  const person = app.user(userId);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!data) return <div className="card h-64 animate-pulse" />;

  async function payout(undo = false) {
    try {
      setData(await post<EarningsSummary>('/earnings/payout', { userId, month, undo }));
      app.toast(undo ? 'Payout undone' : `Marked ${person?.name ?? ''}'s earnings through ${monthLabel(month)} as paid`);
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  async function remove(e: Earning) {
    try {
      await del(`/earnings/${e.id}`);
      reload();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  const t = data.totals;
  const monthUnpaid = data.entries.filter((e) => !e.paidOutAt).reduce((a, e) => a + e.amount, 0);
  const isCurrent = month === thisMonth();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={onMonthChange} />
        {!self && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Lock size={12} /> Only {person?.name.split(' ')[0] ?? 'they'} and admins can see this
          </span>
        )}
      </div>

      <section className={clsx('card p-5', compact && 'p-4')}>
        <div className="text-sm text-slate-500">{isCurrent ? 'Earned so far this month' : `Earned in ${monthLabel(month)}`}</div>
        <div className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{money(t.total)}</div>
        <div className="mt-1 text-sm text-slate-500">in commissions & tips, on top of hourly pay · last month {money(data.lastMonth.total)}</div>
        <div className={clsx('mt-4 grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          <Stat label="Commissions" value={money(t.commission)} />
          <Stat label="Tips" value={money(t.tip)} />
          <Stat
            label="Still owed (all months)"
            value={money(data.unpaid)}
            sub={data.unpaid > 0 ? 'Not yet on a paycheck' : 'All paid out'}
            className={compact ? 'col-span-2' : 'col-span-2 sm:col-span-1'}
          />
        </div>
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.unpaid > 0 && (
              <Button variant="secondary" onClick={() => payout()}>
                Mark paid out through {monthLabel(month, 'short')}
              </Button>
            )}
            {monthUnpaid === 0 && data.entries.length > 0 && (
              <Button variant="ghost" onClick={() => payout(true)}>
                Undo {monthLabel(month, 'short')} payout
              </Button>
            )}
          </div>
        )}
      </section>

      <HistoryChart history={data.history} selected={month} onSelect={onMonthChange} />

      {(manage || self) && <LogEarning userId={userId} onSaved={reload} />}

      <section className="card">
        <h3 className="border-b border-slate-100 px-4 py-3 font-semibold">Entries · {monthLabel(month)}</h3>
        {data.entries.length ? (
          <ul className="divide-y divide-slate-100">
            {data.entries.map((e) => (
              <li key={e.id} className="group flex items-start gap-3 px-4 py-3 text-sm">
                <div className="w-14 shrink-0 pt-0.5 text-slate-500">{shortDate(e.earnedOn)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindChip kind={e.kind} />
                    {e.jobId && (
                      <Link to={compact ? `/tech/jobs/${e.jobId}` : `/jobs/${e.jobId}`} className="truncate font-medium text-brand-700 hover:underline">
                        {e.jobNumber} · {e.jobTitle}
                      </Link>
                    )}
                  </div>
                  {e.note && <div className="mt-0.5 text-slate-500">{e.note}</div>}
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{money(e.amount)}</div>
                  <div className={clsx('text-xs', e.paidOutAt ? 'text-slate-400' : 'text-amber-700')}>{e.paidOutAt ? 'Paid out' : 'Owed'}</div>
                </div>
                {canEdit(e) && (
                  <button
                    className="pt-0.5 text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible"
                    onClick={() => remove(e)}
                    aria-label="Remove entry"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-slate-500">Nothing logged for {monthLabel(month)} yet.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={clsx('rounded-lg bg-slate-50 px-3 py-2.5', className)}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Six months of totals as single-series bars; hover or tap a bar for the split, click to open that month. */
function HistoryChart({ history, selected, onSelect }: { history: EarningsSummary['history']; selected: string; onSelect: (m: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...history.map((h) => h.total));
  const H = 120;
  const shown = history.find((h) => h.month === (hover ?? selected));
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">Last 6 months</h3>
        {shown && (
          <span className="text-xs text-slate-500 tabular-nums">
            {monthLabel(shown.month, 'short')}: {money(shown.total)} · {money(shown.commission)} commission · {money(shown.tip)} tips
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 border-b border-slate-200" style={{ height: H + 20 }} role="list" onMouseLeave={() => setHover(null)}>
        {history.map((h) => {
          const height = h.total > 0 ? Math.max(4, (h.total / max) * H) : 0;
          const active = h.month === selected;
          return (
            <button
              key={h.month}
              role="listitem"
              className="group flex h-full flex-1 flex-col items-center justify-end px-1"
              onMouseEnter={() => setHover(h.month)}
              onFocus={() => setHover(h.month)}
              onClick={() => onSelect(h.month)}
              aria-label={`${monthLabel(h.month)}: ${money(h.total)}`}
            >
              {(active || hover === h.month) && <span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700">{money(h.total)}</span>}
              <span
                className={clsx('w-full max-w-12 rounded-t transition-colors', active ? 'bg-brand-600' : 'bg-brand-200 group-hover:bg-brand-400')}
                style={{ height }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {history.map((h) => (
          <span key={h.month} className={clsx('flex-1 text-center text-xs', h.month === selected ? 'font-semibold text-slate-800' : 'text-slate-500')}>
            {monthLabel(h.month, 'short')}
          </span>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>Commissions and tips by month</caption>
          <tbody>
            {history.map((h) => (
              <tr key={h.month}>
                <th>{monthLabel(h.month)}</th>
                <td>{money(h.commission)} commission</td>
                <td>{money(h.tip)} tips</td>
                <td>{money(h.total)} total</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Log a commission (pay managers) or a tip (anyone, for themselves) against a person, optionally on one of their jobs. */
function LogEarning({ userId, onSaved }: { userId: number; onSaved: () => void }) {
  const app = useApp();
  const manage = app.can('manage_pay');
  const { data: jobs } = useApi<Job[]>(`/jobs?assigneeId=${userId}`);
  const recent = useMemo(() => (jobs ?? []).filter((j) => j.scheduledStart && j.scheduledStart.slice(0, 10) <= todayISO()).slice(0, 30), [jobs]);
  const [kind, setKind] = useState<EarningKind>(manage ? 'commission' : 'tip');
  const [form, setForm] = useState({ amount: '', jobId: '', note: '', earnedOn: todayISO() });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post('/earnings', {
        kind,
        userId,
        amount: Number(form.amount),
        jobId: form.jobId ? Number(form.jobId) : null,
        note: form.note,
        earnedOn: form.earnedOn,
      });
      setForm({ ...form, amount: '', note: '', jobId: '' });
      app.toast(`${KIND_META[kind].label} logged`);
      onSaved();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{manage ? 'Log a commission or tip' : 'Log a tip'}</h3>
        {manage && (
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
            {(['commission', 'tip'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={clsx('rounded-md px-3 py-1', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500')}
              >
                {KIND_META[k].label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[110px_140px_1fr]">
        <input
          id="earning-amount"
          className="input"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="$ amount"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          id="earning-date"
          className="input"
          type="date"
          required
          value={form.earnedOn}
          onChange={(e) => setForm({ ...form, earnedOn: e.target.value })}
        />
        <select id="earning-job" className="input" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })}>
          <option value="">No job</option>
          {recent.map((j) => (
            <option key={j.id} value={j.id}>
              {j.number} · {j.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input
          id="earning-note"
          className="input flex-1"
          placeholder={kind === 'tip' ? 'Cash, check, added to card…' : 'What it was for'}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <Button>Add</Button>
      </div>
    </form>
  );
}

/** On a job: its commissions & tips (only your own unless you manage pay), with quick logging. */
export function JobEarningsCard({ job, onChange, large }: { job: Pick<Job, 'id' | 'assigneeId' | 'total'>; onChange?: () => void; large?: boolean }) {
  const app = useApp();
  const manage = app.can('manage_pay');
  const me = app.currentUserId;
  const { data, reload } = useApi<Earning[]>(`/jobs/${job.id}/earnings?as=${me}`);
  const canEdit = useCanEdit();
  const [kind, setKind] = useState<EarningKind>(manage ? 'commission' : 'tip');
  const [who, setWho] = useState<number | null>(manage ? job.assigneeId : me);
  const person = app.user(who);
  const suggested = kind === 'commission' && person?.commissionRate && job.total > 0 ? Math.round(job.total * person.commissionRate) / 100 : null;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = amount || (suggested ? String(suggested) : '');
    try {
      await post('/earnings', {
        kind,
        userId: manage ? who : me,
        jobId: job.id,
        amount: Number(value),
        note: note || (kind === 'commission' && suggested && !amount ? `${person!.commissionRate}% of ${money(job.total)}` : ''),
      });
      setAmount('');
      setNote('');
      app.toast(`${KIND_META[kind].label} added to ${manage ? (person?.name.split(' ')[0] ?? 'their') + "'s" : 'your'} tracker`);
      reload();
      onChange?.();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  async function remove(e: Earning) {
    try {
      await del(`/earnings/${e.id}`);
      reload();
      onChange?.();
    } catch (err) {
      app.toast((err as Error).message, 'error');
    }
  }

  return (
    <section className={clsx('card', large ? 'p-4' : 'p-5')}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{manage ? 'Commissions & tips' : 'My tips & commission'}</h2>
        <Link to={large ? '/tech/pay' : '/earnings'} className="text-xs text-brand-600 hover:underline">
          {manage ? 'Earnings tracker' : 'My tracker'} →
        </Link>
      </div>
      {data?.length ? (
        <ul className="mb-3 divide-y divide-slate-100 text-sm">
          {data.map((e) => (
            <li key={e.id} className="group flex items-center gap-2 py-2">
              <KindChip kind={e.kind} />
              {manage && <span className="font-medium">{app.user(e.userId)?.name}</span>}
              <span className="min-w-0 flex-1 truncate text-slate-500">{e.note}</span>
              <span className="font-semibold tabular-nums">{money(e.amount)}</span>
              {canEdit(e) && (
                <button className="text-slate-300 hover:text-rose-600 sm:invisible sm:group-hover:visible" onClick={() => remove(e)} aria-label="Remove entry">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-500">{manage ? 'No commissions or tips logged on this job.' : 'Nothing logged for you on this job yet.'}</p>
      )}
      <form onSubmit={submit} className="space-y-2">
        {manage && (
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
              {(['commission', 'tip'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={clsx('rounded-md px-3 py-1', kind === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500')}
                >
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
            <select id="job-earning-person" className="input w-auto flex-1" value={who ?? ''} onChange={(e) => setWho(Number(e.target.value) || null)} required>
              <option value="">Who earned it?</option>
              {app.activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.commissionRate ? ` (${u.commissionRate}%)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <input
            id="job-earning-amount"
            className={clsx('input w-32', large && 'py-2.5 text-base')}
            type="number"
            min="0.01"
            step="0.01"
            required={!suggested}
            placeholder={suggested ? money(suggested) : '$ amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            id="job-earning-note"
            className={clsx('input flex-1', large && 'py-2.5 text-base')}
            placeholder={kind === 'tip' ? 'Cash, check…' : 'Note'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button className={large ? 'px-4' : undefined}>{manage ? 'Add' : 'Log tip'}</Button>
        </div>
        {suggested && !amount && (
          <p className="text-xs text-slate-500">
            Leave blank to use {person!.name.split(' ')[0]}'s {person!.commissionRate}% of {money(job.total)} = {money(suggested)}
          </p>
        )}
      </form>
    </section>
  );
}

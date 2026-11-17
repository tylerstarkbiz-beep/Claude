import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useApi } from '../api';
import { useApp } from '../store';
import { money } from '../format';
import { Avatar, PageHeader } from '../components/ui';
import { EarningsTracker, monthLabel, thisMonth } from '../components/Earnings';
import type { TeamEarningsRow } from '../../shared/types';

/** Commissions & tips. Everyone sees their own tracker; people who manage pay also get the whole team. */
export function Earnings() {
  const app = useApp();
  const manage = app.can('manage_pay');
  const [month, setMonth] = useState(thisMonth);
  const [picked, setPicked] = useState<number | null>(null);
  const userId = (manage && picked) || app.currentUserId;
  if (!userId) return null;
  const person = app.user(userId);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={manage ? 'Commissions & tips' : 'My commissions & tips'}
        subtitle={
          manage
            ? "Log commissions, check anyone's tracker and mark payouts. Each person can only see their own."
            : 'What you have earned on top of hourly pay, added by the office once verified. Only you and the owners can see this.'
        }
      />
      <div className={clsx(manage && 'grid gap-6 lg:grid-cols-[320px_1fr]')}>
        {manage && <TeamList month={month} selected={userId} picked={picked} onSelect={setPicked} />}
        <div>
          {manage && (
            <div className="mb-3 flex items-center gap-2">
              <Avatar user={person} size={28} />
              <h2 className="text-lg font-semibold">{person?.name}</h2>
              {person?.commissionRate ? <span className="text-sm text-slate-500">· {person.commissionRate}% commission</span> : null}
            </div>
          )}
          <EarningsTracker key={userId} userId={userId} month={month} onMonthChange={setMonth} />
        </div>
      </div>
    </div>
  );
}

function TeamList({ month, selected, picked, onSelect }: { month: string; selected: number; picked: number | null; onSelect: (id: number) => void }) {
  const app = useApp();
  const { data } = useApi<TeamEarningsRow[]>(`/earnings/team?month=${month}&as=${app.currentUserId}`);
  const rows = (data ?? []).filter((r) => r.total > 0 || r.unpaid > 0 || app.user(r.userId)?.commissionRate);
  // Open on the first person with earnings when the viewer has none of their own.
  useEffect(() => {
    if (picked === null && data && !rows.some((r) => r.userId === app.currentUserId) && rows[0]) onSelect(rows[0].userId);
  }, [picked, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((a, r) => a + r.total, 0);
  const owed = rows.reduce((a, r) => a + r.unpaid, 0);
  return (
    <section className="card self-start">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="font-semibold">Team · {monthLabel(month)}</div>
        <div className="text-xs text-slate-500 tabular-nums">
          {money(total)} earned · {money(owed)} still owed
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const u = app.user(r.userId);
          return (
            <li key={r.userId}>
              <button
                onClick={() => onSelect(r.userId)}
                className={clsx('flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50', r.userId === selected && 'bg-brand-50')}
              >
                <Avatar user={u} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u?.name}</div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {money(r.commission)} comm. · {money(r.tip)} tips
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="font-semibold">{money(r.total)}</div>
                  {r.unpaid > 0 && <div className="text-xs text-amber-700">{money(r.unpaid)} owed</div>}
                </div>
              </button>
            </li>
          );
        })}
        {!rows.length && data && <li className="px-4 py-6 text-sm text-slate-500">Nobody has commissions or tips yet.</li>}
      </ul>
    </section>
  );
}

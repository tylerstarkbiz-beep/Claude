import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../api';
import { useApp } from '../store';
import { addDays, hm, localDate, money, todayISO } from '../format';
import { Avatar, Button, PageHeader } from '../components/ui';

type Sheet = { from: string; to: string; users: { userId: number; days: Record<string, number>; totalMinutes: number; jobMinutes: number; laborCost: number }[] };

function monday(d = new Date()) {
  const s = new Date(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return localDate(s);
}

/** Weekly hours per employee. Each cell links to that person's daily log. */
export function Timesheets() {
  const app = useApp();
  const [from, setFrom] = useState(monday());
  const { data } = useApi<Sheet>(`/timesheets?from=${from}&days=7`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const today = todayISO();
  const money$ = app.can('view_financials');
  // Active members, plus anyone inactive who still has hours this week.
  const people = app.users.filter(
    (u) => (!app.divisionId || u.divisionIds.includes(app.divisionId)) && (u.active || data?.users.find((s) => s.userId === u.id)?.totalMinutes),
  );
  const rows = people.map((u) => ({ user: u, sheet: data?.users.find((s) => s.userId === u.id) }));
  const dayTotal = (d: string) => rows.reduce((a, r) => a + (r.sheet?.days[d] ?? 0), 0);
  const grand = rows.reduce((a, r) => a + (r.sheet?.totalMinutes ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Timesheets"
        subtitle={`Week of ${new Date(from + 'T00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" onClick={() => setFrom(monday())}>
              This week
            </Button>
            <Button variant="secondary" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week">
              <ChevronRight size={16} />
            </Button>
          </>
        }
      />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Employee</th>
              {days.map((d) => (
                <th key={d} className={clsx('px-2 py-3 text-center', d === today && 'text-brand-700')}>
                  {new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </th>
              ))}
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">On jobs</th>
              {money$ && <th className="px-4 py-3 text-right">Labor cost</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ user, sheet }) => (
              <tr key={user.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar user={user} size={24} /> {user.name}
                  </div>
                </td>
                {days.map((d) => {
                  const m = sheet?.days[d] ?? 0;
                  return (
                    <td key={d} className={clsx('px-1 py-1 text-center', d === today && 'bg-brand-50/50')}>
                      <Link
                        to={`/daily/${user.id}/${d}`}
                        className={clsx('block rounded px-2 py-1.5 hover:bg-brand-50', m ? 'font-medium' : 'text-slate-300', m > 600 && 'text-amber-600')}
                        title="Open daily log"
                      >
                        {m ? hm(m) : '—'}
                      </Link>
                    </td>
                  );
                })}
                <td className={clsx('px-3 py-2 text-right font-semibold', (sheet?.totalMinutes ?? 0) > 2400 && 'text-amber-600')}>
                  {hm(sheet?.totalMinutes ?? 0)}
                </td>
                <td className="px-3 py-2 text-right text-slate-500">
                  {sheet?.totalMinutes ? `${Math.round((sheet.jobMinutes / sheet.totalMinutes) * 100)}%` : '—'}
                </td>
                {money$ && (
                  <td className="px-4 py-2 text-right tabular-nums" title={user.hourlyRate ? `${money(user.hourlyRate)}/hr now` : 'No hourly cost set'}>
                    {sheet?.laborCost ? money(sheet.laborCost) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs font-semibold text-slate-600">
            <tr>
              <td className="px-4 py-3">Total</td>
              {days.map((d) => (
                <td key={d} className="px-2 py-3 text-center">
                  {dayTotal(d) ? hm(dayTotal(d)) : '—'}
                </td>
              ))}
              <td className="px-3 py-3 text-right">{hm(grand)}</td>
              <td />
              {money$ && <td className="px-4 py-3 text-right">{money(rows.reduce((a, r) => a + (r.sheet?.laborCost ?? 0), 0))}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Amber means over 10h in a day or 40h in a week. Click any cell to see that person's full day.</p>
    </div>
  );
}

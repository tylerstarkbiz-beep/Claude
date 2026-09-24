import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  CalendarDays,
  CircleUserRound,
  Clock,
  NotebookPen,
  Receipt,
  Smartphone,
  TrendingUp,
  UserCog,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Plus,
  Settings,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { logoMark, useApp } from '../store';
import { post } from '../api';
import { Avatar, divisionIcon } from './ui';
import type { Board, Permission } from '../../shared/types';

const NAV: { to: string; label: string; icon: typeof Wrench; end?: boolean; perm?: Permission }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/my-work', label: 'My Work', icon: CircleUserRound },
  { to: '/jobs', label: 'Jobs', icon: Wrench },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/daily', label: 'Daily Logs', icon: NotebookPen },
  { to: '/timesheets', label: 'Timesheets', icon: Clock },
  { to: '/invoices', label: 'Invoices', icon: Receipt, perm: 'view_financials' },
  { to: '/profitability', label: 'Profitability', icon: TrendingUp, perm: 'view_financials' },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/team', label: 'Team', icon: UserCog, perm: 'manage_team' },
  { to: '/automations', label: 'Automations', icon: Zap, perm: 'manage_settings' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'manage_settings' },
];

export function Layout() {
  const app = useApp();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const boards = app.boards.filter((b) => !app.divisionId || b.divisionId === app.divisionId || b.divisionId === null);

  const [addingBoard, setAddingBoard] = useState(false);
  async function newBoard(name: string) {
    setAddingBoard(false);
    if (!name.trim()) return;
    const board = await post<Board>('/boards', { name: name.trim(), divisionId: app.divisionId });
    await app.reload();
    navigate(`/boards/${board.id}`);
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-auto p-3 text-sm">
      <BrandLockup />
      {NAV.filter((n) => !n.perm || app.can(n.perm)).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            clsx(
              'relative flex items-center gap-2.5 rounded-md px-2.5 py-2',
              isActive
                ? 'bg-brand-50 font-medium text-brand-700 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent-500'
                : 'text-slate-600 hover:bg-slate-100',
            )
          }
        >
          <Icon size={17} /> {label}
        </NavLink>
      ))}

      <NavLink to="/tech" className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-slate-600 hover:bg-slate-100">
        <Smartphone size={17} /> Tech app
      </NavLink>

      <div className="mt-5 flex items-center justify-between px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Boards
        <button onClick={() => setAddingBoard(true)} className="rounded p-0.5 hover:bg-slate-200 hover:text-slate-600" title="New board" aria-label="New board">
          <Plus size={14} />
        </button>
      </div>
      {addingBoard && (
        <input
          autoFocus
          className="input my-1 py-1.5"
          placeholder="Board name, then Enter"
          onKeyDown={(e) => {
            if (e.key === 'Enter') newBoard(e.currentTarget.value);
            if (e.key === 'Escape') setAddingBoard(false);
          }}
          onBlur={(e) => newBoard(e.target.value)}
        />
      )}
      {boards.map((b) => {
        const div = app.division(b.divisionId);
        return (
          <NavLink
            key={b.id}
            to={`/boards/${b.id}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx('flex items-center gap-2.5 rounded-md px-2.5 py-1.5', isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            <LayoutGrid size={15} style={{ color: div?.color ?? '#64748b' }} />
            <span className="truncate">{b.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  const me = app.user(app.currentUserId);

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-64 bg-white" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <button className="rounded p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            <DivisionTab active={app.divisionId === null} onClick={() => app.setDivisionId(null)} color="var(--brand)" label="All divisions" />
            {app.divisions.map((d) => {
              const Icon = divisionIcon(d.icon);
              return (
                <DivisionTab
                  key={d.id}
                  active={app.divisionId === d.id}
                  onClick={() => app.setDivisionId(d.id)}
                  color={d.color}
                  label={d.name}
                  icon={<Icon size={14} />}
                />
              );
            })}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
            <Avatar user={me} size={28} />
            <select
              className="hidden bg-transparent text-slate-700 outline-none sm:block"
              value={app.currentUserId ?? ''}
              onChange={(e) => app.setCurrentUserId(Number(e.target.value))}
              title="Viewing as"
            >
              {app.activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function DivisionTab({ active, onClick, color, label, icon }: { active: boolean; onClick: () => void; color: string; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition', active ? 'text-white' : 'text-slate-600 hover:bg-slate-100')}
      style={active ? { background: color } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/** Company badge + name, styled after the logo: bold name, small accent-colored tagline. */
export function BrandLockup({ onDark }: { onDark?: boolean }) {
  const { company } = useApp();
  const mark = logoMark(company);
  const words = company.name.split(' ');
  const [main, rest] = [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  return (
    <div className="mb-3 flex items-center gap-2 px-1 py-1">
      {mark ? (
        <img src={mark} alt="" className={clsx('h-10 w-10 shrink-0 object-contain', onDark && 'rounded-full bg-white p-0.5')} />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 font-bold text-white">{company.name.slice(0, 1)}</span>
      )}
      <div className="min-w-0 leading-tight">
        <div className={clsx('truncate text-[17px] font-extrabold uppercase tracking-tight', onDark ? 'text-white' : 'text-brand-600')}>{main}</div>
        {rest && <div className={clsx('text-[9px] font-semibold uppercase leading-snug tracking-[0.08em]', onDark ? 'text-white/80' : 'text-accent-500')}>{rest}</div>}
      </div>
    </div>
  );
}

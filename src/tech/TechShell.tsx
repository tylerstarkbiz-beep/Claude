import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { ClipboardCheck, LayoutDashboard, Wrench } from 'lucide-react';
import { useApp } from '../store';
import { Avatar } from '../components/ui';

/** Phone layout for field techs: a slim header and bottom tabs sized for thumbs. */
export function TechShell() {
  const app = useApp();
  const me = app.user(app.currentUserId);
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-slate-50">
      <header className="flex items-center gap-3 bg-indigo-700 px-4 py-3 text-white" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <Avatar user={me} size={34} />
        <div className="min-w-0 flex-1">
          <select
            className="w-full truncate bg-transparent font-semibold outline-none"
            value={app.currentUserId ?? ''}
            onChange={(e) => app.setCurrentUserId(Number(e.target.value))}
            aria-label="Signed in as"
          >
            {app.users.map((u) => (
              <option key={u.id} value={u.id} className="text-slate-900">
                {u.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-indigo-200">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 mx-auto grid max-w-md grid-cols-3 border-t border-slate-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { to: '/tech', label: 'Today', icon: Wrench, end: true },
          { to: '/tech/day', label: 'My Day', icon: ClipboardCheck },
          { to: '/', label: 'Office', icon: LayoutDashboard },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2.5 text-xs', isActive && to !== '/' ? 'text-indigo-700' : 'text-slate-500')}
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

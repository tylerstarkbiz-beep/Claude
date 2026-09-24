import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Briefcase, Droplets, Sparkles, Thermometer, Truck, X, type LucideIcon } from 'lucide-react';
import { initials } from '../format';
import { useApp } from '../store';
import { PERMISSION_META, type Division, type FieldDef, type Permission, type User } from '../../shared/types';

const ICONS: Record<string, LucideIcon> = { droplets: Droplets, truck: Truck, sparkles: Sparkles, thermometer: Thermometer };
export const divisionIcon = (icon: string) => ICONS[icon] ?? Briefcase;

export function DivisionBadge({ division, compact }: { division?: Division; compact?: boolean }) {
  if (!division) return null;
  const Icon = divisionIcon(division.icon);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: division.color + '1f', color: division.color }}
      title={division.name}
    >
      <Icon size={12} />
      {!compact && division.name}
    </span>
  );
}

export function Avatar({ user, size = 26 }: { user?: User; size?: number }) {
  if (!user)
    return (
      <span
        className="inline-grid place-items-center rounded-full border border-dashed border-slate-300 text-slate-300"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        ?
      </span>
    );
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
      title={user.name}
    >
      {initials(user.name)}
    </span>
  );
}

export function Pill({ label, color, className }: { label: string; color: string; className?: string }) {
  return (
    <span className={clsx('inline-block rounded px-2 py-0.5 text-xs font-medium text-white', className)} style={{ background: color }}>
      {label}
    </span>
  );
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'secondary' && 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'text-rose-600 hover:bg-rose-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Close a popover when clicking outside of it. */
export function useOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return ref;
}

export interface Option<V extends string | number> {
  value: V;
  label: string;
  color: string;
}

/** Monday-style colored status cell that opens a picker. */
export function StatusCell<V extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div ref={ref} className={clsx('relative h-full w-full', className)}>
      <button
        className="h-full w-full truncate px-2 text-xs font-medium text-white transition hover:brightness-95"
        style={{ background: current.color }}
        onClick={() => setOpen((o) => !o)}
      >
        {current.label}
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              className="mb-1 block w-full rounded px-2 py-1.5 text-xs font-medium text-white last:mb-0 hover:brightness-95"
              style={{ background: o.color }}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onChange(o.value);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PersonPicker({
  value,
  onChange,
  users,
  size = 26,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  users?: User[];
  size?: number;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const list = users ?? app.activeUsers;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center">
        <Avatar user={app.user(value)} size={size} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-1 max-h-72 w-52 -translate-x-1/2 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100"
            onClick={() => (onChange(null), setOpen(false))}
          >
            <Avatar size={22} /> Unassigned
          </button>
          {list.map((u) => (
            <button
              key={u.id}
              className={clsx(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100',
                u.id === value && 'bg-brand-50',
              )}
              onClick={() => (onChange(u.id), setOpen(false))}
            >
              <Avatar user={u} size={22} /> {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={clsx('card w-full p-0', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={onClose}>
      <div className="h-full w-full max-w-xl overflow-auto bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Renders an input for a division-specific custom field. */
export function CustomFieldInput({
  field,
  value,
  onChange,
  onBlur,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  if (field.type === 'select')
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  if (field.type === 'textarea')
    return <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />;
  return (
    <input
      className="input"
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

/** Stacked bar showing distribution of statuses (Monday's "battery"). */
export function StatusBattery({ counts, meta }: { counts: Record<string, number>; meta: Record<string, { label: string; color: string }> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <div className="h-4 w-full rounded bg-slate-100" />;
  return (
    <div className="flex h-4 w-full overflow-hidden rounded">
      {Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => (
          <div
            key={key}
            style={{ width: `${(n / total) * 100}%`, background: meta[key]?.color ?? '#ccc' }}
            title={`${meta[key]?.label ?? key}: ${n}`}
          />
        ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Shows children only if the current person has the permission; otherwise explains who to ask. */
export function RequirePerm({ perm, children }: { perm: Permission; children: ReactNode }) {
  const app = useApp();
  if (app.can(perm)) return <>{children}</>;
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold">You don't have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">
        It needs the <b>{PERMISSION_META[perm].label}</b> permission. An owner can turn it on for you under Team.
      </p>
    </div>
  );
}

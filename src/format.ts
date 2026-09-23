export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 });

export const todayISO = () => localDate(new Date());

export function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00' : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateTime(iso: string | null) {
  if (!iso) return 'Unscheduled';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function time(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function relative(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** 445 → "7h 25m" */
export function hm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Minutes since a local timestamp. */
export const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T00:00');
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function longDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// Time helpers for the schedule. Job times are local wall-clock strings: YYYY-MM-DDTHH:MM.
import { localDate } from '../../format';
import type { Job } from '../../../shared/types';

export const SNAP = 15; // minutes
export const DEFAULT_DURATION = 120;
export const PX_PER_MIN = 0.8; // 48px per hour

export const dateOf = (iso: string) => iso.slice(0, 10);
export const minutesOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
export const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/** date + minutes-from-midnight → YYYY-MM-DDTHH:MM (minutes past midnight roll into the next day). */
export function at(date: string, minutes: number): string {
  const d = new Date(date + 'T00:00');
  d.setMinutes(minutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${localDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function duration(job: Job): number {
  if (!job.scheduledStart || !job.scheduledEnd) return DEFAULT_DURATION;
  const ms = new Date(job.scheduledEnd).getTime() - new Date(job.scheduledStart).getTime();
  return Math.max(SNAP, Math.round(ms / 60000));
}

export const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
};

export const startOfWeek = (date: string) => {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return localDate(d);
};

/** 600 → "10:00 AM" (for messages; the grid uses the compact `clock`). */
export const clockLong = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}`;
};

/**
 * Side-by-side placement for overlapping blocks: each item gets a lane and the number of lanes
 * in its overlap cluster, so width = 1/lanes and left = lane/lanes.
 */
export function layoutLanes<T extends { s: number; e: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.s);
    if (lane === -1) lane = laneEnds.push(item.e) - 1;
    else laneEnds[lane] = item.e;
    cluster.push({ ...item, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, item.e);
  }
  flush();
  return out;
}

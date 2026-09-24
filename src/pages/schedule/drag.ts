// Pointer-based drag for the schedule (works with mouse, pen and touch).
// Drop zones are plain elements marked with data attributes:
//   data-drop="time" data-date="YYYY-MM-DD" data-start-min="360" [data-user="7" | "none"]   (hour grids)
//   data-drop="day"  data-date="YYYY-MM-DD"                                                  (month cells)
import { useCallback, useEffect, useRef, useState } from 'react';
import { PX_PER_MIN, SNAP, dateOf, snap } from './time';
import type { Job } from '../../../shared/types';

export type DropTarget =
  | { kind: 'time'; date: string; minutes: number; /** undefined = keep the current tech */ userId?: number | null }
  | { kind: 'day'; date: string };

export type DragMode = 'move' | 'resize';

export interface DragState {
  job: Job;
  mode: DragMode;
  x: number;
  y: number;
  target: DropTarget | null;
}

interface Pending {
  job: Job;
  mode: DragMode;
  /** Minutes between the job's start and where it was grabbed, so the block doesn't jump under the pointer. */
  grabMin: number;
  x0: number;
  y0: number;
  started: boolean;
}

const THRESHOLD = 5; // px of movement before a press becomes a drag

function findTarget(x: number, y: number, p: Pending): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  if (!el) return null;
  const date = el.dataset.date!;
  if (el.dataset.drop === 'day') return p.mode === 'move' ? { kind: 'day', date } : null;

  const rect = el.getBoundingClientRect();
  const raw = Number(el.dataset.startMin) + (y - rect.top) / PX_PER_MIN;
  const user = el.dataset.user;
  const userId = user === undefined ? undefined : user === 'none' ? null : Number(user);
  if (p.mode === 'resize') {
    // Resizing stays in the job's own column.
    if (!p.job.scheduledStart || date !== dateOf(p.job.scheduledStart)) return null;
    if (userId !== undefined && userId !== p.job.assigneeId) return null;
    return { kind: 'time', date, minutes: Math.min(24 * 60, snap(raw)), userId };
  }
  return { kind: 'time', date, minutes: Math.max(0, Math.min(24 * 60 - SNAP, snap(raw - p.grabMin))), userId };
}

export function useScheduleDrag({
  enabled,
  onDrop,
  onClick,
}: {
  enabled: boolean;
  onDrop: (job: Job, mode: DragMode, target: DropTarget) => void;
  onClick: (job: Job) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<Pending | null>(null);
  const handlers = useRef({ onDrop, onClick });
  handlers.current = { onDrop, onClick };

  const move = useCallback((e: PointerEvent) => {
    const p = pending.current;
    if (!p) return;
    if (!p.started && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < THRESHOLD) return;
    p.started = true;
    e.preventDefault();
    setDrag({ job: p.job, mode: p.mode, x: e.clientX, y: e.clientY, target: findTarget(e.clientX, e.clientY, p) });
  }, []);

  const end = useCallback(
    (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      document.body.style.userSelect = '';
      setDrag(null);
      if (!p) return;
      if (!p.started) {
        if (p.mode === 'move') handlers.current.onClick(p.job);
        return;
      }
      const target = findTarget(e.clientX, e.clientY, p);
      if (target) handlers.current.onDrop(p.job, p.mode, target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [move],
  );

  const cancel = useCallback(() => {
    pending.current = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', cancel);
    document.body.style.userSelect = '';
    setDrag(null);
  }, [move, end]);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag, cancel]);

  /** Props for anything that can be clicked (opens the job) or dragged (reschedules it). */
  const bind = (job: Job, mode: DragMode = 'move') => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (!enabled) {
        if (mode === 'move') pending.current = { job, mode, grabMin: 0, x0: e.clientX, y0: e.clientY, started: false };
        else return;
      } else {
        // In hour grids, remember where in the block it was grabbed.
        const block = (e.currentTarget.closest('[data-block]') as HTMLElement | null) ?? e.currentTarget;
        const grabMin = mode === 'move' && block.dataset.block === 'timed' ? (e.clientY - block.getBoundingClientRect().top) / PX_PER_MIN : 0;
        pending.current = { job, mode, grabMin, x0: e.clientX, y0: e.clientY, started: false };
        document.body.style.userSelect = 'none';
      }
      if (enabled) window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', cancel);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (mode === 'move' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handlers.current.onClick(job);
      }
    },
  });

  return { drag, bind };
}

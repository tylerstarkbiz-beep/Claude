import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { userCan, type Board, type Division, type Permission, type User } from '../shared/types';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'automation';
}

interface AppState {
  divisions: Division[];
  /** Everyone, including inactive members (for names on history). */
  users: User[];
  /** Active members, for pickers and schedules. */
  activeUsers: User[];
  /** Whether the person using the app has a permission. */
  can: (perm: Permission) => boolean;
  boards: Board[];
  reload: () => Promise<void>;
  /** Global division filter; null means "All divisions". */
  divisionId: number | null;
  setDivisionId: (id: number | null) => void;
  /** Who is using the app (stand-in until real auth). */
  currentUserId: number | null;
  setCurrentUserId: (id: number) => void;
  division: (id: number | null | undefined) => Division | undefined;
  user: (id: number | null | undefined) => User | undefined;
  toast: (message: string, kind?: Toast['kind']) => void;
  /** Show toasts for automation results returned by the API. */
  announce: (result: { automations?: string[] }) => void;
}

const Ctx = createContext<AppState | null>(null);

function stored(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: number | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // Storage may be unavailable (private mode); preferences just won't persist.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [divisionId, setDivisionIdState] = useState<number | null>(() => stored('fb.division'));
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(() => stored('fb.user'));
  const [toasts, setToasts] = useState<Toast[]>([]);

  const reload = useCallback(async () => {
    const data = await api<{ divisions: Division[]; users: User[]; boards: Board[] }>('/bootstrap');
    setDivisions(data.divisions);
    setUsers(data.users);
    setBoards(data.boards);
    setLoaded(true);
    setCurrentUserIdState((cur) => (cur && data.users.some((u) => u.id === cur && u.active) ? cur : (data.users.find((u) => u.active)?.id ?? null)));
    setDivisionIdState((cur) => (cur && data.divisions.some((d) => d.id === cur) ? cur : null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'automation' ? 6000 : 3500);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      divisions,
      users,
      activeUsers: users.filter((u) => u.active),
      can: (perm) => userCan(users.find((u) => u.id === currentUserId), perm),
      boards,
      reload,
      divisionId,
      setDivisionId: (id) => (setDivisionIdState(id), store('fb.division', id)),
      currentUserId,
      setCurrentUserId: (id) => (setCurrentUserIdState(id), store('fb.user', id)),
      division: (id) => divisions.find((d) => d.id === id),
      user: (id) => users.find((u) => u.id === id),
      toast,
      announce: (result) => result.automations?.forEach((m) => toast(m, 'automation')),
    }),
    [divisions, users, boards, reload, divisionId, currentUserId, toast],
  );

  if (!loaded) return <div className="grid h-full place-items-center text-slate-400">Loading…</div>;

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-lg px-4 py-3 text-sm shadow-lg ' +
              (t.kind === 'error'
                ? 'bg-rose-600 text-white'
                : t.kind === 'automation'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-white')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

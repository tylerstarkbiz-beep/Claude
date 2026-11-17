import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getStaffSession, setStaffSession, SIGNED_OUT_EVENT } from './api';
import { Login } from './pages/Login';
import { userCan, type Board, type CompanySettings, type Division, type Permission, type User } from '../shared/types';
import { DEFAULT_BRAND, DEFAULT_LOGO, DEFAULT_MARK } from '../shared/brand';
import { applyBrand } from './brand';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'automation';
}

interface AppState {
  /** Company name, logo and colors (from Settings). */
  company: CompanySettings;
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
  /** The signed-in staff member. */
  currentUserId: number | null;
  signOut: () => void;
  division: (id: number | null | undefined) => Division | undefined;
  user: (id: number | null | undefined) => User | undefined;
  toast: (message: string, kind?: Toast['kind']) => void;
  /** Show toasts for automation results returned by the API. */
  announce: (result: { automations?: string[] }) => void;
}

const Ctx = createContext<AppState | null>(null);

const FALLBACK_COMPANY: CompanySettings = {
  name: 'Big Country Cleanup & Restoration',
  phone: '',
  email: '',
  address: '',
  paymentTermsDays: 30,
  defaultTaxRate: 0,
  invoiceFooter: '',
  logo: DEFAULT_LOGO,
  textReminders: true,
  quoteFollowUps: true,
  quoteFollowUpDays: 7,
  depositPercent: 0,
  ...DEFAULT_BRAND,
};

/** Small square badge for the sidebar/app header: the bundled badge when the logo is the default, else the logo itself. */
export const logoMark = (company: CompanySettings) => (company.logo === DEFAULT_LOGO ? DEFAULT_MARK : company.logo);

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
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [divisionId, setDivisionIdState] = useState<number | null>(() => stored('fb.division'));
  // The signed-in staff member (from /bootstrap); null until signed in.
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(() => !!getStaffSession());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const reload = useCallback(async () => {
    const data = await api<{ divisions: Division[]; users: User[]; boards: Board[]; company: CompanySettings; me: User | null }>('/bootstrap');
    setCompany(data.company);
    setDivisions(data.divisions);
    setUsers(data.users);
    setBoards(data.boards);
    setCurrentUserId(data.me?.id ?? null);
    setLoaded(true);
    setDivisionIdState((cur) => (cur && data.divisions.some((d) => d.id === cur) ? cur : null));
  }, []);

  useEffect(() => {
    if (signedIn) reload().catch(() => undefined);
  }, [signedIn, reload]);

  // Session expired or revoked (e.g. password reset): back to the sign-in page.
  useEffect(() => {
    const out = () => {
      setSignedIn(false);
      setLoaded(false);
      setCurrentUserId(null);
    };
    window.addEventListener(SIGNED_OUT_EVENT, out);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, out);
  }, []);

  const signOut = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setStaffSession(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }, []);

  // Apply the company's colors to the whole UI (the brand-* / accent-* palettes read these) and name the tab.
  useEffect(() => {
    if (company) applyBrand(company);
  }, [company]);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'automation' ? 6000 : 3500);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      company: company ?? { ...FALLBACK_COMPANY },
      divisions,
      users,
      activeUsers: users.filter((u) => u.active),
      can: (perm) => userCan(users.find((u) => u.id === currentUserId), perm),
      boards,
      reload,
      divisionId,
      setDivisionId: (id) => (setDivisionIdState(id), store('fb.division', id)),
      currentUserId,
      signOut,
      division: (id) => divisions.find((d) => d.id === id),
      user: (id) => users.find((u) => u.id === id),
      toast,
      announce: (result) => result.automations?.forEach((m) => toast(m, 'automation')),
    }),
    [company, divisions, users, boards, reload, divisionId, currentUserId, toast, signOut],
  );

  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  if (!loaded)
    return (
      <div className="grid h-full place-items-center bg-white">
        <img src={DEFAULT_LOGO} alt="" className="w-56 max-w-[70%] animate-pulse" />
      </div>
    );

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
                  ? 'bg-brand-600 text-white'
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

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarDays, CreditCard, FileText, Home, Inbox, LogOut, Mail, Receipt } from 'lucide-react';
import { useBranding, type Branding } from '../brand';
import { DEMO } from '../env';
import { Button } from '../components/ui';
import { SignedOut, getSession, papi, setSession } from './session';
import { EstimatesPage, InvoicePage, InvoicesPage, PaymentPage, PortalHome, RequestsPage, VisitsPage } from './PortalPages';

export interface PortalMe {
  client: { id: number; name: string; company: string | null; email: string | null; phone: string | null; address: string | null };
  divisions: { id: number; name: string; color: string }[];
  payments: { enabled: boolean; publishableKey: string | null };
}

interface PortalCtx {
  me: PortalMe;
  brand: Branding;
  toast: (message: string, error?: boolean) => void;
  signOut: () => void;
}

const Ctx = createContext<PortalCtx | null>(null);
export const usePortalApp = () => useContext(Ctx)!;

/** The customer portal: its own sign-in, look and navigation, separate from the office app. */
export function PortalApp() {
  const brand = useBranding((name) => `${name} customer portal`);
  return (
    <div className="min-h-full bg-slate-50">
      <Routes>
        <Route path="login" element={<Login brand={brand} />} />
        <Route path="*" element={<SignedIn brand={brand} />} />
      </Routes>
    </div>
  );
}

function Logo({ brand, size = 'h-16' }: { brand: Branding; size?: string }) {
  return brand.logo ? <img src={brand.logo} alt={brand.name} className={clsx(size, 'w-auto object-contain')} /> : <div className="text-xl font-bold text-brand-600">{brand.name}</div>;
}

function Login({ brand }: { brand: Branding }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  // Links in texts can point at a page (e.g. estimates); only portal pages are allowed.
  const next = params.get('next')?.startsWith('/portal') ? params.get('next')! : '/portal';
  const [state, setState] = useState<'idle' | 'redeeming' | 'sent' | 'error'>(token ? 'redeeming' : 'idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) return;
    papi<{ session: string }>('/portal/auth/redeem', { method: 'POST', body: { token } })
      .then(({ session }) => {
        setSession(session);
        navigate(next, { replace: true });
      })
      .catch((e: Error) => {
        setState('error');
        setMessage(e.message);
      });
  }, [token, next, navigate]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    await papi('/portal/auth/request', { method: 'POST', body: { email } }).catch(() => undefined);
    setState('sent');
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center px-4 py-12">
      <Logo brand={brand} size="h-32" />
      <h1 className="mt-6 text-center text-xl font-bold">Customer portal</h1>
      {state === 'redeeming' ? (
        <p className="mt-4 text-slate-500">Signing you in…</p>
      ) : state === 'sent' ? (
        <div className="card mt-6 w-full p-5 text-center">
          <Mail className="mx-auto mb-2 text-brand-600" />
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-sm text-slate-500">If {email} is on file with us, a sign-in link is on its way. It works once and expires in 30 minutes.</p>
        </div>
      ) : (
        <form onSubmit={requestLink} className="card mt-6 w-full space-y-3 p-5">
          {state === 'error' && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{message}</p>}
          <p className="text-sm text-slate-600">Enter the email we have on file and we'll send you a secure sign-in link. No password needed.</p>
          <input id="portal-email" className="input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="w-full py-2.5">Email me a sign-in link</Button>
          {DEMO && <p className="text-xs text-slate-500">Demo: emails aren't sent. Open the portal from a client's page in the office app instead.</p>}
        </form>
      )}
      {brand.phone && <p className="mt-6 text-sm text-slate-500">Need help? Call {brand.phone}</p>}
      {DEMO && (
        <Link to="/clients" className="mt-4 text-sm text-brand-600 hover:underline">
          ← Back to the office app (demo)
        </Link>
      )}
    </div>
  );
}

const NAV = [
  { to: '/portal', label: 'Home', icon: Home, end: true },
  { to: '/portal/requests', label: 'Requests', icon: Inbox },
  { to: '/portal/estimates', label: 'Estimates', icon: FileText },
  { to: '/portal/visits', label: 'Visits', icon: CalendarDays },
  { to: '/portal/invoices', label: 'Invoices', icon: Receipt },
  { to: '/portal/payment', label: 'Payment', icon: CreditCard },
];

function SignedIn({ brand }: { brand: Branding }) {
  const navigate = useNavigate();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; error?: boolean }[]>([]);
  const toast = useCallback((message: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    if (!getSession()) return;
    papi<PortalMe>('/portal/me')
      .then(setMe)
      .catch((e) => (e instanceof SignedOut ? navigate('/portal/login', { replace: true }) : toast(e.message, true)));
  }, [navigate, toast]);

  if (!getSession()) return <Navigate to="/portal/login" replace />;
  if (!me) return <div className="grid min-h-full place-items-center text-slate-400">Loading…</div>;

  const signOut = () => {
    papi('/portal/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
    navigate('/portal/login', { replace: true });
  };

  return (
    <Ctx.Provider value={{ me, brand, toast, signOut }}>
      <header className="border-b-[3px] border-accent-500 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Logo brand={brand} size="h-12" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-slate-500">Customer portal</div>
            <div className="truncate font-semibold">{me.client.name}</div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx('flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm', isActive ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route index element={<PortalHome />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="estimates" element={<EstimatesPage />} />
          <Route path="visits" element={<VisitsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="invoices/:id" element={<InvoicePage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-center text-xs text-slate-400">
        {brand.name}
        {brand.phone && ` · ${brand.phone}`}
        {brand.email && ` · ${brand.email}`}
        {DEMO && (
          <div className="mt-2">
            <Link to={`/clients/${me.client.id}`} className="text-brand-600 hover:underline">
              ← Back to the office app (demo)
            </Link>
          </div>
        )}
      </footer>
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.error ? 'bg-rose-600' : 'bg-slate-900')}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

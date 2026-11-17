import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { ApiError, post, setStaffSession } from '../api';
import { useBranding } from '../brand';
import { DEMO } from '../env';
import { Button } from '../components/ui';

// Demo accounts, shown only in the clickable demo (they all share the demo password).
const DEMO_PASSWORD = 'BigCountry2026';
const DEMO_ACCOUNTS = [
  { email: 'admin@example.com', who: 'Office Admin', what: 'Full access' },
  { email: 'tony@example.com', who: 'Tony Ruiz', what: 'Technician' },
  { email: 'jordan@example.com', who: 'Jordan Lee', what: 'Office staff' },
];

/** Staff sign-in for the office and tech apps. */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const brand = useBranding((name) => `Sign in · ${name}`);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { session } = await post<{ session: string }>('/auth/login', { email, password });
      setStaffSession(session);
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 px-4 py-12">
      {brand.logo ? <img src={brand.logo} alt={brand.name} className="h-28 w-auto object-contain" /> : <div className="text-xl font-bold text-brand-600">{brand.name}</div>}
      <form onSubmit={submit} className="card mt-6 w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-bold">Team sign-in</h1>
          <p className="mt-1 text-sm text-slate-500">For staff and techs. Customers use the customer portal.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <label className="block">
          <span className="label">Email</span>
          <input id="login-email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <span className="relative block">
            <input
              id="login-password"
              className="input pr-10"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700"
              onClick={() => setShow(!show)}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <Button className="w-full py-2.5" disabled={busy}>
          <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs text-slate-500">Forgot your password? Ask an admin to set a new one on the Team page.</p>
      </form>

      {DEMO && (
        <div className="card mt-4 w-full max-w-sm p-4 text-sm">
          <div className="font-semibold">Demo accounts</div>
          <p className="mb-2 text-xs text-slate-500">
            Password for all: <code className="rounded bg-slate-100 px-1">{DEMO_PASSWORD}</code>. Tap one to fill it in.
          </p>
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={() => (setEmail(a.email), setPassword(DEMO_PASSWORD), setError(''))}
            >
              <span>
                <span className="font-medium">{a.who}</span> <span className="text-slate-500">· {a.email}</span>
              </span>
              <span className="text-xs text-slate-500">{a.what}</span>
            </button>
          ))}
          <Link to="/portal/login" className="mt-2 block text-xs text-brand-600 hover:underline">
            Customer portal →
          </Link>
        </div>
      )}
    </div>
  );
}

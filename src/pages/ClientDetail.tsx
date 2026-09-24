import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, Globe, Mail, Plus } from 'lucide-react';
import { patch, post, useApi } from '../api';
import { DEMO } from '../env';
import { useApp } from '../store';
import { dateTime, money, relative } from '../format';
import { Button, DivisionBadge, Pill } from '../components/ui';
import { JobForm } from '../components/JobForm';
import { JOB_STATUS_META, type Client, type Job } from '../../shared/types';

export function ClientDetailPage() {
  const { id } = useParams();
  const app = useApp();
  const { data: client, reload } = useApi<Client & { jobs: Job[] }>(`/clients/${id}`);
  const [creating, setCreating] = useState(false);
  if (!client) return <div className="text-slate-400">Loading…</div>;

  const lifetime = client.jobs.filter((j) => ['completed', 'invoiced', 'paid'].includes(j.status)).reduce((a, j) => a + j.total, 0);
  const save = async (changes: Partial<Client>) => {
    await patch(`/clients/${client.id}`, changes);
    reload();
  };
  const field = (k: keyof Client, label: string) => (
    <div>
      <span className="label">{label}</span>
      <input
        className="input"
        key={String(client[k])}
        defaultValue={(client[k] as string) ?? ''}
        onBlur={(e) => e.target.value !== (client[k] ?? '') && save({ [k]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Clients
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {client.jobs.length} jobs · {money(lifetime)} lifetime revenue
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New job for client
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <section className="card space-y-3 p-5">
            {field('name', 'Name')}
            {field('company', 'Company')}
            {field('phone', 'Phone')}
            {field('email', 'Email')}
            {field('address', 'Address')}
            <div>
              <span className="label">Notes</span>
              <textarea
                className="input"
                rows={4}
                key={client.notes}
                defaultValue={client.notes ?? ''}
                onBlur={(e) => e.target.value !== (client.notes ?? '') && save({ notes: e.target.value })}
              />
            </div>
          </section>
          <PortalCard client={client} />
        </div>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Job history (all divisions)</h2>
          <div className="divide-y divide-slate-100">
            {client.jobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{j.title}</div>
                  <div className="text-xs text-slate-500">
                    {j.number} · {dateTime(j.scheduledStart)}
                  </div>
                </div>
                <DivisionBadge division={app.division(j.divisionId)} />
                <Pill label={JOB_STATUS_META[j.status].label} color={JOB_STATUS_META[j.status].color} />
                <span className="w-20 text-right text-sm font-medium">{money(j.total)}</span>
              </Link>
            ))}
            {!client.jobs.length && <p className="py-4 text-sm text-slate-400">No jobs yet.</p>}
          </div>
        </section>
      </div>
      {creating && <JobForm onClose={() => setCreating(false)} clientId={client.id} />}
    </div>
  );
}

interface PortalStatus {
  enabled: boolean;
  lastLogin: string | null;
  emails: {
    id: number;
    subject: string;
    status: string;
    createdAt: string;
    link: string | null;
  }[];
}

const EMAIL_STATUS: Record<string, string> = {
  sent: 'Sent',
  queued: 'Sending…',
  failed: 'Failed to send',
  not_configured: 'Not sent: email service not connected',
};

/** The client's customer portal: status, sign-in link, invite emails. */
function PortalCard({ client }: { client: Client }) {
  const app = useApp();
  const navigate = useNavigate();
  const { data, setData, reload } = useApi<PortalStatus>(`/clients/${client.id}/portal`);
  if (!data) return null;

  const link = async () => (await post<{ link: string }>(`/clients/${client.id}/portal/link`, {})).link;

  async function preview() {
    const path = await link();
    if (DEMO) navigate(path);
    else window.open(path, '_blank', 'noopener');
  }
  async function copy() {
    const url = location.origin + (await link());
    navigator.clipboard
      .writeText(url)
      .then(() => app.toast('Sign-in link copied. It works once and expires in 7 days.'))
      .catch(() => app.toast(url));
  }
  async function invite() {
    try {
      await post(`/clients/${client.id}/portal/invite`, {});
      app.toast(`Portal invite created for ${client.email}`);
      reload();
    } catch (e) {
      app.toast((e as Error).message, 'error');
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Globe size={17} className="text-brand-600" /> Customer portal
        </h2>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={async (e) =>
              setData({
                ...data,
                ...(await patch<{ enabled: boolean }>(`/clients/${client.id}/portal`, { enabled: e.target.checked })),
              })
            }
          />
          {data.enabled ? 'On' : 'Off'}
        </label>
      </div>
      {data.enabled ? (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {data.lastLogin ? `Last signed in ${relative(data.lastLogin)}.` : 'Has not signed in yet.'} Clients sign in with an emailed link; there's no
            password.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={preview}>
              <ExternalLink size={15} /> View as client
            </Button>
            <Button variant="secondary" onClick={copy}>
              <Copy size={15} /> Copy sign-in link
            </Button>
            {client.email && (
              <Button variant="secondary" onClick={invite}>
                <Mail size={15} /> Email invite
              </Button>
            )}
          </div>
          {!client.email && <p className="mt-2 text-xs text-amber-600">Add an email address so this client can get invites and sign-in links.</p>}
          <TextingToggle clientId={client.id} />
          {data.emails.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
              {data.emails.map((m) => (
                <div key={m.id} className="text-xs">
                  <div className="font-medium text-slate-700">{m.subject}</div>
                  <div className={m.status === 'sent' ? 'text-emerald-600' : m.status === 'failed' ? 'text-rose-600' : 'text-slate-500'}>
                    {EMAIL_STATUS[m.status] ?? m.status} · {relative(m.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">The portal is off for this client. Turning it off signed them out and cancelled any unused links.</p>
      )}
    </section>
  );
}

/** Whether automatic and office texts go to this client (e.g. they asked us to stop texting). */
function TextingToggle({ clientId }: { clientId: number }) {
  const { data, setData } = useApi<{ optOut: boolean; mobile: string | null }>(`/clients/${clientId}/texting`);
  if (!data) return null;
  return (
    <label className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
      <input
        type="checkbox"
        checked={!data.optOut && !!data.mobile}
        disabled={!data.mobile}
        onChange={async (e) => setData({ ...data, ...(await patch<{ optOut: boolean }>(`/clients/${clientId}/texting`, { optOut: !e.target.checked })) })}
      />
      {data.mobile ? 'Text messages (reminders, confirmations, estimate follow-ups)' : 'Text messages: add a mobile number to turn on'}
    </label>
  );
}

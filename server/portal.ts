// Customer portal. Clients sign in with single-use emailed links (no passwords) and only ever see
// their own records: every query below is scoped to the client id from the session, never from
// the request. Also the office-side controls (invite, copy link, turn off) and the email outbox.
import { Router, type Request } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { logActivity, tx, type DB } from './db.ts';
import { h, id, required } from './http.ts';
import { HttpError, JOB_SELECT, getClient, getJob, localDateTime, mapClient, mapJob, mapLineItem, mapUser } from './repo.ts';
import { createJob } from './jobs.ts';
import { getCompany, getDetail, chargeInvoice, createDepositInvoice, getInvoice, settleIntent } from './invoices.ts';
import { assertOwnCard, ensureCustomer, listCards, type Payments } from './stripe.ts';
import { mapOutbox, queueEmail } from './mailer.ts';
import type { Client } from '../shared/types.ts';

const INVITE_DAYS = 7;
const LOGIN_MINUTES = 30;
const SESSION_DAYS = 30;

const newToken = () => randomBytes(32).toString('base64url');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();
const now = () => new Date().toISOString();

/** Create a single-use sign-in link for a client. Returns the app path to put in an email. */
export function createLoginLink(db: DB, clientId: number, validMs = INVITE_DAYS * 86_400_000, next?: string): string {
  const token = newToken();
  db.prepare('INSERT INTO portal_tokens (client_id, token_hash, expires_at) VALUES (?, ?, ?)').run(clientId, hash(token), inFuture(validMs));
  return `/portal/login?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
}

/** Email a client their portal invite. Called automatically when a client is added. */
export function sendInvite(db: DB, client: Client): number | null {
  if (!client.email) return null;
  const company = getCompany(db);
  const link = createLoginLink(db, client.id);
  const first = client.name.split(' ')[0];
  return queueEmail(db, {
    to: client.email,
    clientId: client.id,
    link,
    subject: `Your ${company.name} customer portal`,
    body: [
      `Hi ${first},`,
      '',
      `${company.name} has set up a customer portal for you. You can request service, approve estimates, see your scheduled visits and invoices, and save a card for faster payment.`,
      '',
      'Open your portal: {link}',
      '',
      `This link works once and expires in ${INVITE_DAYS} days. Anytime after that, go to the portal and enter your email to get a new sign-in link.`,
      '',
      company.phone ? `Questions? Call us at ${company.phone}.` : '',
    ].join('\n'),
  });
}

function sessionClient(db: DB, req: Request): Client {
  const auth = req.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const row = token
    ? (db.prepare('SELECT client_id FROM portal_sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), now()) as { client_id: number } | undefined)
    : undefined;
  const client = row ? getClient(db, row.client_id) : undefined;
  const enabled = client && (db.prepare('SELECT portal_enabled FROM clients WHERE id = ?').get(client.id) as { portal_enabled: number }).portal_enabled;
  if (!client || !enabled) throw new HttpError(401, 'Please sign in again');
  return client;
}

/** What a client may see of a job: no internal notes, costs, custom fields or full staff names. */
function publicJob(db: DB, jobId: number) {
  const j = getJob(db, jobId)!;
  const tech = j.assigneeId ? db.prepare('SELECT * FROM users WHERE id = ?').get(j.assigneeId) : undefined;
  const division = db.prepare('SELECT name, color FROM divisions WHERE id = ?').get(j.divisionId) as { name: string; color: string };
  const approved = db.prepare('SELECT approved_at FROM jobs WHERE id = ?').get(j.id) as { approved_at: string | null };
  return {
    id: j.id,
    number: j.number,
    title: j.title,
    description: j.description,
    status: j.status,
    address: j.address,
    scheduledStart: j.scheduledStart,
    scheduledEnd: j.scheduledEnd,
    total: j.total,
    division,
    tech: tech ? { firstName: mapUser(tech).name.split(' ')[0], color: mapUser(tech).color } : null,
    approvedAt: approved.approved_at,
    depositPercent: j.depositPercent ?? getCompany(db).depositPercent,
    signature: (db.prepare('SELECT signer_name AS name, signed_at AS signedAt FROM estimate_signatures WHERE job_id = ? ORDER BY id DESC').get(j.id) as
      | { name: string; signedAt: string }
      | undefined) ?? null,
    deposit: depositFor(db, j.id),
    lineItems: db.prepare('SELECT * FROM line_items WHERE job_id = ? ORDER BY id').all(j.id).map(mapLineItem),
    createdAt: j.createdAt,
  };
}

/** The latest non-void deposit invoice for a job, if any. */
export function depositFor(db: DB, jobId: number) {
  const row = db.prepare("SELECT id FROM invoices WHERE job_id = ? AND kind = 'deposit' AND status != 'void' ORDER BY id DESC").get(jobId) as { id: number } | undefined;
  if (!row) return null;
  const inv = getInvoice(db, row.id);
  return { invoiceId: inv.id, number: inv.number, amount: inv.total, balance: inv.balance, status: inv.status };
}

function ownJob(db: DB, client: Client, jobId: number) {
  const j = getJob(db, jobId);
  if (!j || j.clientId !== client.id) throw new HttpError(404, 'Not found');
  return j;
}

export function createPortalApi(db: DB, pay: Payments): Router {
  const api = Router();

  // ---------- Office side ----------

  api.get(
    '/clients/:id/portal',
    h((req) => {
      const c = db.prepare('SELECT portal_enabled, portal_last_login FROM clients WHERE id = ?').get(id(req)) as Record<string, any> | undefined;
      if (!c) throw new HttpError(404, 'Client not found');
      return {
        enabled: !!c.portal_enabled,
        lastLogin: c.portal_last_login,
        emails: db.prepare('SELECT * FROM outbox WHERE client_id = ? ORDER BY id DESC LIMIT 10').all(id(req)).map(mapOutbox),
      };
    }),
  );

  /** A fresh sign-in link the office can copy or open to see the portal as this client. */
  api.post(
    '/clients/:id/portal/link',
    h((req) => {
      if (!getClient(db, id(req))) throw new HttpError(404, 'Client not found');
      return { link: createLoginLink(db, id(req)) };
    }),
  );

  api.post(
    '/clients/:id/portal/invite',
    h((req) => {
      const client = getClient(db, id(req));
      if (!client) throw new HttpError(404, 'Client not found');
      if (!client.email) throw new HttpError(400, 'Add an email address for this client first');
      db.prepare('UPDATE clients SET portal_enabled = 1 WHERE id = ?').run(client.id);
      sendInvite(db, client);
      return { ok: true };
    }),
  );

  api.patch(
    '/clients/:id/portal',
    h((req) => {
      const enabled = !!req.body.enabled;
      db.prepare('UPDATE clients SET portal_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id(req));
      // Turning the portal off signs the client out everywhere and cancels outstanding links.
      if (!enabled) {
        db.prepare('DELETE FROM portal_sessions WHERE client_id = ?').run(id(req));
        db.prepare('DELETE FROM portal_tokens WHERE client_id = ? AND used_at IS NULL').run(id(req));
      }
      return { enabled };
    }),
  );

  /** Office: the signed estimate and deposit for a job. */
  api.get(
    '/jobs/:id/estimate',
    h((req) => {
      const sig = db
        .prepare('SELECT signer_name, signature, total, ip, signed_at FROM estimate_signatures WHERE job_id = ? ORDER BY id DESC')
        .get(id(req)) as Record<string, any> | undefined;
      return {
        signature: sig ? { name: sig.signer_name, image: sig.signature, total: sig.total, ip: sig.ip, signedAt: sig.signed_at } : null,
        deposit: depositFor(db, id(req)),
        defaultDepositPercent: getCompany(db).depositPercent,
      };
    }),
  );

  /** Which outside services are connected (keys are set on the server, never shown). */
  api.get(
    '/settings/integrations',
    h(() => ({
      email: !!(process.env.SENDGRID_API_KEY && process.env.MAIL_FROM && process.env.PUBLIC_URL),
      sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.PUBLIC_URL),
      payments: pay.enabled,
    })),
  );

  api.get(
    '/outbox',
    h(() => db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 100').all().map(mapOutbox)),
  );

  // ---------- Portal: signing in ----------

  api.get(
    '/public/branding',
    h(() => {
      const c = getCompany(db);
      return { name: c.name, logo: c.logo, brandColor: c.brandColor, accentColor: c.accentColor, phone: c.phone, email: c.email };
    }),
  );

  api.post(
    '/portal/auth/redeem',
    h((req) => {
      const token = String(req.body.token ?? '');
      const row = db
        .prepare('SELECT id, client_id FROM portal_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
        .get(hash(token), now()) as { id: number; client_id: number } | undefined;
      const enabled = row && (db.prepare('SELECT portal_enabled FROM clients WHERE id = ?').get(row.client_id) as { portal_enabled: number } | undefined)?.portal_enabled;
      if (!row || !enabled) throw new HttpError(401, 'This sign-in link has expired or was already used. Enter your email to get a new one.');
      const session = newToken();
      tx(db, () => {
        db.prepare('UPDATE portal_tokens SET used_at = ? WHERE id = ?').run(now(), row.id);
        db.prepare('INSERT INTO portal_sessions (client_id, token_hash, expires_at) VALUES (?, ?, ?)').run(row.client_id, hash(session), inFuture(SESSION_DAYS * 86_400_000));
        db.prepare('UPDATE clients SET portal_last_login = ? WHERE id = ?').run(now(), row.client_id);
      });
      return { session };
    }),
  );

  /** Email a sign-in link. Always answers the same way so nobody can probe which emails are clients. */
  api.post(
    '/portal/auth/request',
    h((req) => {
      const email = String(req.body.email ?? '').trim().toLowerCase();
      const row = email ? db.prepare('SELECT * FROM clients WHERE lower(email) = ? AND portal_enabled = 1').get(email) : undefined;
      if (row) {
        const client = mapClient(row);
        const company = getCompany(db);
        queueEmail(db, {
          to: client.email!,
          clientId: client.id,
          link: createLoginLink(db, client.id, LOGIN_MINUTES * 60_000),
          subject: `Sign in to your ${company.name} portal`,
          body: `Hi ${client.name.split(' ')[0]},\n\nHere's your sign-in link: {link}\n\nIt works once and expires in ${LOGIN_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`,
        });
      }
      return { ok: true };
    }),
  );

  api.post(
    '/portal/auth/logout',
    h((req) => {
      const token = (req.get('authorization') ?? '').replace(/^Bearer /, '');
      if (token) db.prepare('DELETE FROM portal_sessions WHERE token_hash = ?').run(hash(token));
    }),
  );

  // ---------- Portal: the client's records ----------

  api.get(
    '/portal/me',
    h((req) => {
      const client = sessionClient(db, req);
      const divisions = db.prepare('SELECT id, name, color FROM divisions ORDER BY id').all();
      return {
        client: { id: client.id, name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address },
        divisions,
        payments: { enabled: pay.enabled, publishableKey: pay.enabled ? pay.publishableKey : null },
      };
    }),
  );

  api.get(
    '/portal/jobs',
    h((req) => {
      const client = sessionClient(db, req);
      const ids = db.prepare(`${JOB_SELECT} WHERE j.client_id = ? AND j.status != 'cancelled' ORDER BY COALESCE(j.scheduled_start, j.created_at) DESC`).all(client.id).map(mapJob);
      return ids.map((j) => publicJob(db, j.id));
    }),
  );

  api.post(
    '/portal/requests',
    h((req) => {
      const client = sessionClient(db, req);
      const divisionId = Number(req.body.divisionId);
      const division = db.prepare('SELECT name FROM divisions WHERE id = ?').get(divisionId) as { name: string } | undefined;
      if (!division) throw new HttpError(400, 'Pick the kind of service you need');
      const details = required(req.body, 'description').slice(0, 4000);
      const when = String(req.body.preferredTimes ?? '').trim().slice(0, 500);
      const job = createJob(db, {
        clientId: client.id,
        divisionId,
        title: `${division.name} request${req.body.summary ? `: ${String(req.body.summary).slice(0, 80)}` : ''}`,
        description: `${details}${when ? `\n\nPreferred times: ${when}` : ''}\n\n(Submitted in the customer portal)`,
        address: String(req.body.address ?? '').trim() || client.address,
        status: 'request',
        source: 'portal',
      });
      return publicJob(db, job.id);
    }),
  );

  /** Approve and sign an estimate. If a deposit applies, its invoice is created for the client to pay. */
  api.post(
    '/portal/estimates/:id/approve',
    h((req) => {
      const client = sessionClient(db, req);
      const job = ownJob(db, client, id(req));
      if (job.status !== 'quoted' || job.approvedAt) throw new HttpError(409, 'This estimate is no longer open for approval');
      const name = String(req.body.signatureName ?? '').trim().slice(0, 120);
      const signature = String(req.body.signature ?? '');
      if (!name) throw new HttpError(400, 'Type your full name to sign');
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 400_000) throw new HttpError(400, 'Please sign in the box');
      const pct = job.depositPercent ?? getCompany(db).depositPercent;
      tx(db, () => {
        const signedAt = now();
        db.prepare(
          `INSERT INTO estimate_signatures (job_id, client_id, signer_name, signature, total, line_items, ip, user_agent, signed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          job.id,
          client.id,
          name,
          signature,
          job.total,
          JSON.stringify(db.prepare('SELECT description, quantity, unit_price FROM line_items WHERE job_id = ? ORDER BY id').all(job.id)),
          req.ip ?? null,
          String(req.get('user-agent') ?? '').slice(0, 300),
          signedAt,
        );
        db.prepare('UPDATE jobs SET approved_at = ? WHERE id = ?').run(signedAt, job.id);
        logActivity(db, 'portal', `✅ ${client.name} approved and signed estimate ${job.number} (${name})`, { jobId: job.id });
        if (pct > 0 && job.total > 0) createDepositInvoice(db, job.id, pct);
      });
      return publicJob(db, job.id);
    }),
  );

  api.post(
    '/portal/estimates/:id/changes',
    h((req) => {
      const client = sessionClient(db, req);
      const job = ownJob(db, client, id(req));
      const message = required(req.body, 'message').slice(0, 4000);
      db.prepare('INSERT INTO job_notes (job_id, author_id, body, created_at) VALUES (?, NULL, ?, ?)').run(
        job.id,
        `💬 From ${client.name} (portal): ${message}`,
        localDateTime(),
      );
      logActivity(db, 'portal', `💬 ${client.name} asked for changes to ${job.number}`, { jobId: job.id });
      return { ok: true };
    }),
  );

  api.get(
    '/portal/invoices',
    h((req) => {
      const client = sessionClient(db, req);
      const rows = db.prepare("SELECT id FROM invoices WHERE client_id = ? AND status != 'draft' ORDER BY issue_date DESC, id DESC").all(client.id) as { id: number }[];
      return rows.map((r) => {
        const d = getDetail(db, r.id);
        return { id: d.id, number: d.number, status: d.status, overdue: d.overdue, issueDate: d.issueDate, dueDate: d.dueDate, total: d.total, balance: d.balance, jobTitle: d.job?.title ?? null };
      });
    }),
  );

  api.get(
    '/portal/invoices/:id',
    h((req) => {
      const client = sessionClient(db, req);
      const inv = getInvoice(db, id(req));
      if (inv.clientId !== client.id || inv.status === 'draft') throw new HttpError(404, 'Not found');
      const d = getDetail(db, inv.id);
      return {
        company: getCompany(db),
        invoice: { ...d, job: d.job ? { number: d.job.number, title: d.job.title, address: d.job.address } : null },
      };
    }),
  );

  // ---------- Portal: saved cards and paying ----------

  api.get(
    '/portal/cards',
    h(async (req) => {
      const client = sessionClient(db, req);
      if (!pay.enabled) return [];
      return listCards(pay, await ensureCustomer(db, pay, client.id));
    }),
  );

  /** Start saving a card: the browser completes it with Stripe Elements using this secret. */
  api.post(
    '/portal/cards/setup',
    h(async (req) => {
      const client = sessionClient(db, req);
      if (!pay.enabled) throw new HttpError(503, 'Card payments are not set up');
      const customer = await ensureCustomer(db, pay, client.id);
      const intent = await pay.call('POST', '/v1/setup_intents', { customer, usage: 'off_session', payment_method_types: ['card'] });
      return { clientSecret: intent.client_secret, publishableKey: pay.publishableKey };
    }),
  );

  api.post(
    '/portal/cards/:pm/default',
    h(async (req) => {
      const client = sessionClient(db, req);
      const customer = await ensureCustomer(db, pay, client.id);
      await assertOwnCard(pay, customer, req.params.pm);
      await pay.call('POST', `/v1/customers/${customer}`, { invoice_settings: { default_payment_method: req.params.pm } });
      return listCards(pay, customer);
    }),
  );

  api.delete(
    '/portal/cards/:pm',
    h(async (req) => {
      const client = sessionClient(db, req);
      const customer = await ensureCustomer(db, pay, client.id);
      await assertOwnCard(pay, customer, req.params.pm);
      await pay.call('POST', `/v1/payment_methods/${req.params.pm}/detach`);
      return listCards(pay, customer);
    }),
  );

  api.post(
    '/portal/invoices/:id/pay',
    h(async (req) => {
      const client = sessionClient(db, req);
      return chargeInvoice(db, pay, id(req), client.id, String(req.body.paymentMethodId ?? ''), { offSession: false });
    }),
  );

  /** After the bank's approval step in the browser, record the payment once Stripe says it succeeded. */
  api.post(
    '/portal/invoices/:id/pay/confirm',
    h(async (req) => {
      const client = sessionClient(db, req);
      const inv = getInvoice(db, id(req));
      if (inv.clientId !== client.id) throw new HttpError(404, 'Not found');
      const piId = String(req.body.paymentIntentId ?? '');
      if (!/^pi_[A-Za-z0-9_]+$/.test(piId)) throw new HttpError(400, 'Invalid payment');
      const pi = await pay.call('GET', `/v1/payment_intents/${piId}`);
      if (String(pi.metadata?.invoice_id) !== String(inv.id) || String(pi.metadata?.client_id) !== String(client.id)) throw new HttpError(404, 'Not found');
      if (pi.status !== 'succeeded') throw new HttpError(402, 'The payment was not completed');
      return settleIntent(db, inv.id, pi);
    }),
  );

  return api;
}

// Outgoing email and text messages. Every message is recorded in the outbox. Email goes out through
// SendGrid (SENDGRID_API_KEY + MAIL_FROM), texts through Twilio (TWILIO_ACCOUNT_SID +
// TWILIO_AUTH_TOKEN + TWILIO_FROM); both also need PUBLIC_URL for links. Until a service is
// connected, messages wait in the outbox so the office can see them and copy their links.
import type { DB } from './db.ts';

export interface Email {
  to: string;
  subject: string;
  body: string;
  /** App path the email points to (e.g. /portal/login?token=…); made absolute with PUBLIC_URL. */
  link?: string | null;
  clientId?: number | null;
}

export interface OutboxEntry {
  id: number;
  channel: 'email' | 'sms';
  kind: string | null;
  jobId: number | null;
  clientId: number | null;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  status: 'queued' | 'sent' | 'failed' | 'not_configured';
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export const mapOutbox = (r: Record<string, any>): OutboxEntry => ({
  id: r.id,
  channel: r.channel ?? 'email',
  kind: r.kind ?? null,
  jobId: r.job_id ?? null,
  clientId: r.client_id,
  to: r.to_address,
  subject: r.subject,
  body: r.body,
  link: r.link,
  status: r.status,
  error: r.error,
  createdAt: r.created_at,
  sentAt: r.sent_at,
});

export const absoluteUrl = (path: string) => `${(process.env.PUBLIC_URL ?? '').replace(/\/$/, '')}${path}`;

const configured = () => !!(process.env.SENDGRID_API_KEY && process.env.MAIL_FROM && process.env.PUBLIC_URL);

/** Record an email and send it in the background when an email service is configured. */
export function queueEmail(db: DB, email: Email): number {
  const r = db
    .prepare('INSERT INTO outbox (client_id, to_address, subject, body, link, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email.clientId ?? null, email.to, email.subject, email.body, email.link ?? null, configured() ? 'queued' : 'not_configured');
  const id = Number(r.lastInsertRowid);
  if (configured()) void send(db, id, email);
  return id;
}

async function send(db: DB, id: number, email: Email) {
  const text = email.link ? email.body.replace('{link}', absoluteUrl(email.link)) : email.body;
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: process.env.MAIL_FROM },
        subject: email.subject,
        content: [{ type: 'text/plain', value: text }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`);
    db.prepare("UPDATE outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(id);
  } catch (err) {
    db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").run(err instanceof Error ? err.message : String(err), id);
  }
}

// ---------- Text messages ----------

export interface Text {
  to: string;
  body: string;
  link?: string | null;
  clientId?: number | null;
  jobId?: number | null;
  /** booking, request_received, quote_ready, reminder, quote_followup, custom */
  kind: string;
}

/** US numbers to E.164 (+15551234567); returns null if it doesn't look like a phone number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.PUBLIC_URL);

export function queueText(db: DB, text: Text): number {
  const to = normalizePhone(text.to);
  if (!to) throw new Error(`Not a valid phone number: ${text.to}`);
  const r = db
    .prepare('INSERT INTO outbox (channel, kind, client_id, job_id, to_address, subject, body, link, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('sms', text.kind, text.clientId ?? null, text.jobId ?? null, to, `Text: ${text.kind.replace(/_/g, ' ')}`, text.body, text.link ?? null, smsConfigured() ? 'queued' : 'not_configured');
  const id = Number(r.lastInsertRowid);
  if (smsConfigured()) void sendText(db, id, to, text);
  return id;
}

async function sendText(db: DB, id: number, to: string, text: Text) {
  const body = text.link ? text.body.replace('{link}', absoluteUrl(text.link)) : text.body;
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
    db.prepare("UPDATE outbox SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(id);
  } catch (err) {
    db.prepare("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?").run(err instanceof Error ? err.message : String(err), id);
  }
}

// Outgoing email. Every message is recorded in the outbox. If an email service is configured
// (SENDGRID_API_KEY + MAIL_FROM) it is sent; otherwise it stays in the outbox so the office can
// see the message and copy its link.
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

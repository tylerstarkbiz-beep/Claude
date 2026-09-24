// Text messages to clients: booking confirmations and other one-off texts from the office, plus the
// automatic 24-hour job reminders and daily follow-ups on estimates waiting for approval.
import { Router } from 'express';
import { logActivity, type DB } from './db.ts';
import { h, id } from './http.ts';
import { HttpError, getClient, getJob } from './repo.ts';
import { getCompany } from './invoices.ts';
import { createLoginLink } from './portal.ts';
import { normalizePhone, queueText } from './mailer.ts';
import type { Client, Job } from '../shared/types.ts';

export const TEXT_KINDS = ['booking', 'request_received', 'quote_ready', 'reminder', 'quote_followup', 'custom'] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

// Texts go out 8am–8pm local time; anything due overnight waits for the morning.
const QUIET_START = 20;
const QUIET_END = 8;
const FOLLOWUP_HOUR = 10;
/** A reminder only makes sense if the job was booked well ahead of time. */
const MIN_LEAD_HOURS = 20;

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function window(job: Job) {
  if (!job.scheduledStart) return 'soon';
  return `${day(job.scheduledStart)}, ${clock(job.scheduledStart)}${job.scheduledEnd ? `–${clock(job.scheduledEnd)}` : ''}`;
}

/** Why a client can't be texted right now, or null if they can. */
export function cannotText(db: DB, client: Client): string | null {
  if (!normalizePhone(client.phone)) return `${client.name} doesn't have a mobile number on file`;
  const row = db.prepare('SELECT sms_opt_out FROM clients WHERE id = ?').get(client.id) as { sms_opt_out: number };
  if (row.sms_opt_out) return `${client.name} opted out of text messages`;
  return null;
}

/** The standard wording for each kind of text. `{link}` becomes a portal sign-in link when sent. */
export function composeText(db: DB, kind: TextKind, job: Job, client: Client): { body: string; link: string | null } {
  const c = getCompany(db);
  const first = client.name.split(/\s|&/)[0];
  const tech = job.assigneeId ? (db.prepare('SELECT name FROM users WHERE id = ?').get(job.assigneeId) as { name: string } | undefined)?.name.split(' ')[0] : null;
  const call = c.phone ? ` Questions? Call ${c.phone}.` : '';
  const stop = ' Reply STOP to opt out.';
  const estimateLink = () => createLoginLink(db, client.id, 7 * 86_400_000, '/portal/estimates');
  switch (kind) {
    case 'booking':
      return {
        body: `Hi ${first}, you're booked with ${c.name} for ${job.title} on ${window(job)}${job.address ? ` at ${job.address}` : ''}.${tech ? ` Your technician is ${tech}.` : ''}${call}${stop}`,
        link: null,
      };
    case 'request_received': {
      const division = (db.prepare('SELECT name FROM divisions WHERE id = ?').get(job.divisionId) as { name: string }).name;
      return { body: `Hi ${first}, thanks for contacting ${c.name}! We got your ${division.toLowerCase()} request and will reach out shortly to schedule.${call}${stop}`, link: null };
    }
    case 'quote_ready':
      return { body: `Hi ${first}, your estimate from ${c.name} for ${job.title} (${money(job.total)}) is ready. Review, approve and sign it here: {link}${call}${stop}`, link: estimateLink() };
    case 'quote_followup':
      return { body: `Hi ${first}, just checking in on your estimate for ${job.title} (${money(job.total)}). You can approve and sign it here: {link}${call}${stop}`, link: estimateLink() };
    case 'reminder':
      return {
        body: `Reminder from ${c.name}: we're scheduled for ${job.title} on ${window(job)}${job.address ? ` at ${job.address}` : ''}. Need to reschedule? ${c.phone ? `Call ${c.phone}.` : 'Reply to this text.'}${stop}`,
        link: null,
      };
    case 'custom':
      return { body: '', link: null };
  }
}

function sendJobText(db: DB, job: Job, client: Client, kind: TextKind, body: string, link: string | null) {
  queueText(db, { to: client.phone!, body, link, clientId: client.id, jobId: job.id, kind });
  logActivity(db, 'text', `📱 Texted ${client.name}: ${kind.replace(/_/g, ' ')}`, { jobId: job.id });
}

/**
 * Send whatever automatic texts are due. Run every few minutes; safe to run repeatedly because
 * each job records what it was sent. Returns one line per text queued.
 */
export function runScheduledTexts(db: DB, now = new Date()): string[] {
  const hour = now.getHours();
  if (hour >= QUIET_START || hour < QUIET_END) return [];
  const company = getCompany(db);
  const sent: string[] = [];

  if (company.textReminders) {
    const jobs = db
      .prepare("SELECT id FROM jobs WHERE status = 'scheduled' AND scheduled_start IS NOT NULL AND reminder_sent_at IS NULL")
      .all() as { id: number }[];
    for (const { id: jobId } of jobs) {
      const job = getJob(db, jobId)!;
      const start = new Date(job.scheduledStart!).getTime();
      const hoursUntil = (start - now.getTime()) / 3_600_000;
      if (hoursUntil <= 0 || hoursUntil > 24) continue;
      const bookedAt = (db.prepare('SELECT booked_at FROM jobs WHERE id = ?').get(jobId) as { booked_at: string | null }).booked_at;
      if (bookedAt && (start - new Date(bookedAt).getTime()) / 3_600_000 < MIN_LEAD_HOURS) {
        db.prepare("UPDATE jobs SET reminder_sent_at = 'skipped: booked less than a day ahead' WHERE id = ?").run(jobId);
        continue;
      }
      const client = getClient(db, job.clientId)!;
      if (cannotText(db, client)) continue;
      const { body, link } = composeText(db, 'reminder', job, client);
      sendJobText(db, job, client, 'reminder', body, link);
      db.prepare('UPDATE jobs SET reminder_sent_at = ? WHERE id = ?').run(now.toISOString(), jobId);
      sent.push(`reminder ${job.number}`);
    }
  }

  if (company.quoteFollowUps && hour >= FOLLOWUP_HOUR) {
    const p = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    const quotes = db
      .prepare(
        `SELECT id FROM jobs WHERE status = 'quoted' AND approved_at IS NULL AND followup_count < ?
           AND (last_followup_on IS NULL OR last_followup_on < ?)
           AND substr(COALESCE(quoted_at, created_at), 1, 10) < ?`,
      )
      .all(company.quoteFollowUpDays, today, today) as { id: number }[];
    for (const { id: jobId } of quotes) {
      const job = getJob(db, jobId)!;
      const client = getClient(db, job.clientId)!;
      if (job.total <= 0 || cannotText(db, client)) continue;
      const { body, link } = composeText(db, 'quote_followup', job, client);
      sendJobText(db, job, client, 'quote_followup', body, link);
      db.prepare('UPDATE jobs SET followup_count = followup_count + 1, last_followup_on = ? WHERE id = ?').run(today, jobId);
      sent.push(`follow-up ${job.number}`);
    }
  }
  return sent;
}

export function createTextingApi(db: DB): Router {
  const api = Router();

  /** The suggested wording for a kind of text, for the office to review before sending. */
  api.get(
    '/jobs/:id/text/:kind',
    h((req) => {
      const job = getJob(db, id(req));
      if (!job) throw new HttpError(404, 'Job not found');
      const kind = req.params.kind as TextKind;
      if (!TEXT_KINDS.includes(kind)) throw new HttpError(400, 'Unknown message');
      const client = getClient(db, job.clientId)!;
      const { body } = composeText(db, kind, job, client);
      return { body, to: client.phone, blocked: cannotText(db, client) };
    }),
  );

  api.post(
    '/jobs/:id/text',
    h((req) => {
      const job = getJob(db, id(req));
      if (!job) throw new HttpError(404, 'Job not found');
      const kind = String(req.body.kind ?? 'custom') as TextKind;
      if (!TEXT_KINDS.includes(kind)) throw new HttpError(400, 'Unknown message');
      const client = getClient(db, job.clientId)!;
      const blocked = cannotText(db, client);
      if (blocked) throw new HttpError(400, blocked);
      // The office may edit the wording; links are regenerated so each text has a fresh sign-in link.
      const standard = composeText(db, kind, job, client);
      const body = String(req.body.body ?? standard.body).trim().slice(0, 1000);
      if (!body) throw new HttpError(400, 'Write a message first');
      const link = body.includes('{link}') ? (standard.link ?? createLoginLink(db, client.id)) : null;
      sendJobText(db, job, client, kind, body, link);
      return { ok: true };
    }),
  );

  api.patch(
    '/clients/:id/texting',
    h((req) => {
      db.prepare('UPDATE clients SET sms_opt_out = ? WHERE id = ?').run(req.body.optOut ? 1 : 0, id(req));
      return { optOut: !!req.body.optOut };
    }),
  );

  api.get(
    '/clients/:id/texting',
    h((req) => {
      const r = db.prepare('SELECT sms_opt_out, phone FROM clients WHERE id = ?').get(id(req)) as { sms_opt_out: number; phone: string | null } | undefined;
      if (!r) throw new HttpError(404, 'Client not found');
      return { optOut: !!r.sms_opt_out, mobile: normalizePhone(r.phone) };
    }),
  );

  return api;
}

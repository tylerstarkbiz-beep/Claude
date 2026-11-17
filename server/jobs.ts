// Creating a job is shared by the office API and the customer portal, so both run the same automations.
import { logActivity, tx, type DB } from './db.ts';
import { runAutomations, syncCompletedAt } from './automations.ts';
import { HttpError, getClient, getJob, nextJobNumber } from './repo.ts';
import type { Job, JobStatus } from '../shared/types.ts';

export interface NewJob {
  divisionId: number;
  clientId: number;
  title: string;
  description?: string | null;
  status?: JobStatus;
  address?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  assigneeId?: number | null;
  customFields?: Record<string, string>;
  lineItems?: { description: string; quantity?: number; unitPrice?: number }[];
  source?: 'office' | 'portal';
  /** Set when converting a quote: links the job back to its quote and request. */
  requestId?: number | null;
  quoteId?: number | null;
  depositPercent?: number | null;
}

export function createJob(db: DB, input: NewJob): Job & { automations: string[] } {
  const client = getClient(db, input.clientId);
  if (!client) throw new HttpError(400, 'Client not found');
  if (!input.title?.trim()) throw new HttpError(400, 'title is required');
  const status = input.status ?? 'scheduled';
  return tx(db, () => {
    const r = db
      .prepare(
        `INSERT INTO jobs (number, division_id, client_id, title, description, status, address, scheduled_start, scheduled_end, assignee_id, custom_fields, source, request_id, quote_id, deposit_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextJobNumber(db, input.divisionId),
        input.divisionId,
        client.id,
        input.title.trim(),
        input.description || null,
        status,
        input.address || client.address,
        input.scheduledStart || null,
        input.scheduledEnd || null,
        input.assigneeId ?? null,
        JSON.stringify(input.customFields ?? {}),
        input.source ?? 'office',
        input.requestId ?? null,
        input.quoteId ?? null,
        input.depositPercent ?? null,
      );
    const jobId = Number(r.lastInsertRowid);
    for (const li of input.lineItems ?? []) {
      db.prepare('INSERT INTO line_items (job_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(
        jobId,
        li.description,
        Number(li.quantity) || 1,
        Number(li.unitPrice) || 0,
      );
    }
    syncCompletedAt(db, jobId, status);
    if (input.scheduledStart) db.prepare('UPDATE jobs SET booked_at = ? WHERE id = ?').run(new Date().toISOString(), jobId);
    const job = getJob(db, jobId)!;
    logActivity(db, 'job', `Created job ${job.number}: ${job.title}`, { jobId, quoteId: input.quoteId ?? null, requestId: input.requestId ?? null });
    const automations = runAutomations(db, { type: 'job_created', job });
    return { ...job, automations };
  });
}

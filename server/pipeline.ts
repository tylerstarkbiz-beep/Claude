// Requests → quotes → jobs → invoices. Each step is its own record that stays on the client's account;
// converting creates the next step and links it back, so the whole history (and every note and photo) follows along.
import { Router } from 'express';
import { logActivity, tx, type DB } from './db.ts';
import { h, id, optNum, required } from './http.ts';
import { HttpError, getClient, getJob, localDateTime } from './repo.ts';
import { createJob } from './jobs.ts';
import { createDepositInvoice, getCompany } from './invoices.ts';
import { staffUser } from './auth.ts';
import {
  QUOTE_STATUSES,
  REQUEST_STATUSES,
  userCan,
  type Chain,
  type Quote,
  type QuoteDetail,
  type QuoteItem,
  type QuoteStatus,
  type ServiceRequest,
} from '../shared/types.ts';

type Row = Record<string, any>;
const cents = (n: number) => Math.round(n * 100) / 100;

// ---------- Mapping & lookups ----------

export const mapRequest = (r: Row): ServiceRequest => ({
  id: r.id,
  number: r.number,
  clientId: r.client_id,
  divisionId: r.division_id,
  title: r.title,
  details: r.details,
  address: r.address,
  preferredTimes: r.preferred_times,
  source: r.source,
  status: r.status,
  assessmentStart: r.assessment_start,
  assessmentEnd: r.assessment_end,
  assessmentAssigneeId: r.assessment_assignee_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export const QUOTE_SELECT = `
  SELECT q.*, COALESCE((SELECT SUM(quantity * unit_price) FROM quote_items qi WHERE qi.quote_id = q.id), 0) AS total
  FROM quotes q`;

export const mapQuote = (r: Row): Quote => ({
  id: r.id,
  number: r.number,
  clientId: r.client_id,
  divisionId: r.division_id,
  requestId: r.request_id,
  title: r.title,
  description: r.description,
  address: r.address,
  status: r.status,
  total: cents(r.total ?? 0),
  depositPercent: r.deposit_percent,
  sentAt: r.sent_at,
  approvedAt: r.approved_at,
  approvedBy: r.approved_by,
  signerName: r.signer_name,
  followupCount: r.followup_count ?? 0,
  createdAt: r.created_at,
});

const mapItem = (r: Row): QuoteItem => ({ id: r.id, quoteId: r.quote_id, description: r.description, quantity: r.quantity, unitPrice: r.unit_price });

export function getRequest(db: DB, requestId: number): ServiceRequest {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!row) throw new HttpError(404, 'Request not found');
  return mapRequest(row);
}

export function getQuote(db: DB, quoteId: number): Quote {
  const row = db.prepare(`${QUOTE_SELECT} WHERE q.id = ?`).get(quoteId);
  if (!row) throw new HttpError(404, 'Quote not found');
  return mapQuote(row);
}

export function getQuoteDetail(db: DB, quoteId: number): QuoteDetail {
  const q = getQuote(db, quoteId);
  const sig = db.prepare('SELECT signature FROM quotes WHERE id = ?').get(quoteId) as { signature: string | null };
  return {
    ...q,
    items: db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id').all(quoteId).map(mapItem),
    client: getClient(db, q.clientId)!,
    signature: sig.signature,
  };
}

const nextNumber = (db: DB, table: 'requests' | 'quotes', prefix: string) =>
  `${prefix}-${(db.prepare(`SELECT COALESCE(MAX(CAST(substr(number, ${prefix.length + 2}) AS INTEGER)), 1000) + 1 AS n FROM ${table}`).get() as { n: number }).n}`;

/** Where a record sits in the chain, looked up from any step. */
export function chainFor(db: DB, kind: 'request' | 'quote' | 'job' | 'invoice', recordId: number): Chain {
  let requestId: number | null = null;
  let quoteId: number | null = null;
  let jobId: number | null = null;
  if (kind === 'invoice') {
    const inv = db.prepare('SELECT job_id, quote_id FROM invoices WHERE id = ?').get(recordId) as Row | undefined;
    if (!inv) throw new HttpError(404, 'Invoice not found');
    jobId = inv.job_id;
    quoteId = inv.quote_id;
  }
  if (kind === 'job') jobId = recordId;
  if (kind === 'quote') quoteId = recordId;
  if (kind === 'request') requestId = recordId;
  if (jobId) {
    const j = db.prepare('SELECT request_id, quote_id FROM jobs WHERE id = ?').get(jobId) as Row | undefined;
    quoteId ??= j?.quote_id ?? null;
    requestId ??= j?.request_id ?? null;
  }
  if (requestId && !quoteId)
    quoteId = (db.prepare('SELECT id FROM quotes WHERE request_id = ? ORDER BY id DESC').get(requestId) as Row | undefined)?.id ?? null;
  if (quoteId) {
    const q = db.prepare('SELECT request_id FROM quotes WHERE id = ?').get(quoteId) as Row | undefined;
    requestId ??= q?.request_id ?? null;
    jobId ??= (db.prepare('SELECT id FROM jobs WHERE quote_id = ? ORDER BY id DESC').get(quoteId) as Row | undefined)?.id ?? null;
  }
  const r = requestId ? (db.prepare('SELECT id, number, status, created_at FROM requests WHERE id = ?').get(requestId) as Row | undefined) : undefined;
  const q = quoteId ? getQuote(db, quoteId) : undefined;
  const j = jobId ? getJob(db, jobId) : undefined;
  const invoices = (
    db
      .prepare(
        `SELECT i.id, i.number, i.status, i.kind, i.tax_rate,
           COALESCE((SELECT SUM(quantity * unit_price) FROM invoice_items it WHERE it.invoice_id = i.id), 0) AS subtotal
         FROM invoices i WHERE (i.job_id = ? OR i.quote_id = ?) ORDER BY i.id`,
      )
      .all(jobId ?? -1, quoteId ?? -1) as Row[]
  ).map((i) => ({ id: i.id, number: i.number, status: i.status, kind: i.kind, total: cents(i.subtotal * (1 + i.tax_rate / 100)) }));
  return {
    request: r ? { id: r.id, number: r.number, status: r.status, createdAt: r.created_at } : null,
    quote: q ? { id: q.id, number: q.number, status: q.status, total: q.total, approvedAt: q.approvedAt } : null,
    job: j ? { id: j.id, number: j.number, status: j.status, completedAt: j.completedAt } : null,
    invoices,
  };
}

// ---------- Shared actions (office and portal) ----------

export interface NewRequest {
  clientId: number;
  divisionId: number;
  title: string;
  details?: string;
  address?: string | null;
  preferredTimes?: string | null;
  source?: 'office' | 'portal';
  createdBy?: number | null;
}

export function createRequest(db: DB, input: NewRequest): ServiceRequest {
  const client = getClient(db, input.clientId);
  if (!client) throw new HttpError(400, 'Client not found');
  if (!db.prepare('SELECT 1 FROM divisions WHERE id = ?').get(input.divisionId)) throw new HttpError(400, 'Pick a division');
  if (!input.title?.trim()) throw new HttpError(400, 'Give the request a short title');
  const number = nextNumber(db, 'requests', 'REQ');
  const r = db
    .prepare(
      `INSERT INTO requests (number, client_id, division_id, title, details, address, preferred_times, source, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      number,
      client.id,
      input.divisionId,
      input.title.trim().slice(0, 200),
      (input.details ?? '').trim().slice(0, 4000),
      input.address?.trim() || client.address,
      input.preferredTimes?.trim() || null,
      input.source ?? 'office',
      input.createdBy ?? null,
      localDateTime(),
    );
  const requestId = Number(r.lastInsertRowid);
  logActivity(db, 'request', `${input.source === 'portal' ? `${client.name} sent` : 'New'} request ${number}: ${input.title.trim()}`, { requestId });
  return getRequest(db, requestId);
}

/** Request → quote: a draft quote carrying the request's details. The request stays, marked converted. */
export function convertRequestToQuote(db: DB, requestId: number, createdBy: number | null): Quote {
  const req = getRequest(db, requestId);
  const existing = db.prepare('SELECT id FROM quotes WHERE request_id = ?').get(requestId) as Row | undefined;
  if (existing) throw new HttpError(409, 'This request already has a quote');
  return tx(db, () => {
    const number = nextNumber(db, 'quotes', 'Q');
    const r = db
      .prepare(
        `INSERT INTO quotes (number, client_id, division_id, request_id, title, description, address, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(number, req.clientId, req.divisionId, req.id, req.title, req.details, req.address, createdBy, localDateTime());
    const quoteId = Number(r.lastInsertRowid);
    db.prepare("UPDATE requests SET status = 'converted' WHERE id = ?").run(req.id);
    logActivity(db, 'quote', `Request ${req.number} converted to quote ${number}`, { requestId: req.id, quoteId });
    return getQuote(db, quoteId);
  });
}

/** Quote → job: copies the line items, scope, address and deposit, and moves any deposit invoice onto the job. */
export function convertQuoteToJob(db: DB, quoteId: number) {
  const q = getQuoteDetail(db, quoteId);
  if (q.status === 'converted') throw new HttpError(409, 'This quote is already a job');
  if (q.status !== 'approved') throw new HttpError(409, 'The customer needs to approve the quote first (or record their approval)');
  return tx(db, () => {
    const req = q.requestId ? getRequest(db, q.requestId) : null;
    const job = createJob(db, {
      clientId: q.clientId,
      divisionId: q.divisionId,
      title: q.title,
      description: q.description || null,
      address: q.address,
      status: 'scheduled',
      source: req?.source ?? 'office',
      lineItems: q.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
      requestId: q.requestId,
      quoteId: q.id,
      depositPercent: q.depositPercent,
    });
    db.prepare("UPDATE quotes SET status = 'converted' WHERE id = ?").run(q.id);
    db.prepare('UPDATE invoices SET job_id = ? WHERE quote_id = ? AND job_id IS NULL').run(job.id, q.id);
    logActivity(db, 'quote', `Quote ${q.number} converted to job ${job.number}`, { quoteId: q.id, jobId: job.id });
    return job;
  });
}

/** Record approval of a quote: a portal signature, or the office noting a verbal/paper approval. */
export function approveQuote(db: DB, quoteId: number, by: { client?: { name: string; signature: string; ip: string | null }; staffName?: string }) {
  const q = getQuote(db, quoteId);
  if (!['sent', 'changes_requested', 'draft'].includes(q.status)) throw new HttpError(409, 'This quote is no longer open for approval');
  const now = localDateTime();
  db.prepare('UPDATE quotes SET status = ?, approved_at = ?, approved_by = ?, signer_name = ?, signature = ?, signed_ip = ? WHERE id = ?').run(
    'approved',
    now,
    by.client ? 'client' : (by.staffName ?? 'office'),
    by.client?.name ?? null,
    by.client?.signature ?? null,
    by.client?.ip ?? null,
    q.id,
  );
  return getQuote(db, q.id);
}

// ---------- Office API ----------

function assertCan(req: Parameters<typeof staffUser>[0], perm: 'manage_jobs') {
  if (!userCan(staffUser(req), perm)) throw new HttpError(403, 'You need the Manage jobs permission for that');
}

function itemInput(b: Row) {
  const description = String(b.description ?? '').trim();
  if (!description) throw new HttpError(400, 'Describe the line item');
  const quantity = Number(b.quantity ?? 1);
  const unitPrice = Number(b.unitPrice ?? 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) throw new HttpError(400, 'Quantity and price must be numbers');
  return { description: description.slice(0, 500), quantity, unitPrice: cents(unitPrice) };
}

export function createPipelineApi(db: DB): Router {
  const api = Router();

  // Requests

  api.get(
    '/requests',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      if (req.query.clientId) (where.push('client_id = ?'), params.push(Number(req.query.clientId)));
      if (req.query.divisionId) (where.push('division_id = ?'), params.push(Number(req.query.divisionId)));
      if (req.query.open === '1') where.push("status IN ('new', 'assessment_scheduled')");
      return db
        .prepare(`SELECT * FROM requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC`)
        .all(...params)
        .map(mapRequest);
    }),
  );

  api.post(
    '/requests',
    h((req) => {
      const b = req.body;
      return createRequest(db, {
        clientId: Number(b.clientId),
        divisionId: Number(b.divisionId),
        title: String(b.title ?? ''),
        details: String(b.details ?? ''),
        address: b.address ?? null,
        preferredTimes: b.preferredTimes ?? null,
        source: 'office',
        createdBy: staffUser(req)?.id ?? null,
      });
    }),
  );

  api.get(
    '/requests/:id',
    h((req) => ({ ...getRequest(db, id(req)), client: getClient(db, getRequest(db, id(req)).clientId), chain: chainFor(db, 'request', id(req)) })),
  );

  api.patch(
    '/requests/:id',
    h((req) => {
      const r = getRequest(db, id(req));
      const b = req.body;
      const status = b.status !== undefined ? b.status : undefined;
      if (status !== undefined && !REQUEST_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
      if (status === 'converted') throw new HttpError(400, 'Use "Convert to quote"');
      const next = {
        title: b.title !== undefined ? String(b.title).trim() || r.title : r.title,
        details: b.details !== undefined ? String(b.details) : r.details,
        address: b.address !== undefined ? b.address || null : r.address,
        preferredTimes: b.preferredTimes !== undefined ? b.preferredTimes || null : r.preferredTimes,
        divisionId: b.divisionId !== undefined ? Number(b.divisionId) : r.divisionId,
        assessmentStart: b.assessmentStart !== undefined ? b.assessmentStart || null : r.assessmentStart,
        assessmentEnd: b.assessmentEnd !== undefined ? b.assessmentEnd || null : r.assessmentEnd,
        assessmentAssigneeId: b.assessmentAssigneeId !== undefined ? optNum(b.assessmentAssigneeId) : r.assessmentAssigneeId,
      };
      if (next.assessmentStart && next.assessmentEnd && next.assessmentEnd <= next.assessmentStart)
        throw new HttpError(400, 'The visit must end after it starts');
      // Booking the assessment visit moves a new request along (unless it's already a quote or archived).
      let nextStatus = status ?? r.status;
      if (status === undefined && r.status === 'new' && next.assessmentStart) nextStatus = 'assessment_scheduled';
      if (status === undefined && r.status === 'assessment_scheduled' && !next.assessmentStart) nextStatus = 'new';
      db.prepare(
        `UPDATE requests SET title = ?, details = ?, address = ?, preferred_times = ?, division_id = ?, assessment_start = ?, assessment_end = ?,
           assessment_assignee_id = ?, status = ? WHERE id = ?`,
      ).run(
        next.title,
        next.details,
        next.address,
        next.preferredTimes,
        next.divisionId,
        next.assessmentStart,
        next.assessmentEnd,
        next.assessmentAssigneeId,
        nextStatus,
        r.id,
      );
      if (next.assessmentStart && next.assessmentStart !== r.assessmentStart) {
        const who = next.assessmentAssigneeId
          ? (db.prepare('SELECT name FROM users WHERE id = ?').get(next.assessmentAssigneeId) as Row | undefined)?.name
          : null;
        logActivity(
          db,
          'request',
          `Assessment visit for ${r.number} booked ${next.assessmentStart.replace('T', ' ').slice(0, 16)}${who ? ` with ${who}` : ''}`,
          {
            requestId: r.id,
          },
        );
      }
      return getRequest(db, r.id);
    }),
  );

  api.post(
    '/requests/:id/quote',
    h((req) => {
      assertCan(req, 'manage_jobs');
      return convertRequestToQuote(db, id(req), staffUser(req)?.id ?? null);
    }),
  );

  api.delete(
    '/requests/:id',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const r = getRequest(db, id(req));
      if (r.status === 'converted') throw new HttpError(409, 'Converted requests are kept as history. Archive it instead.');
      db.prepare('DELETE FROM requests WHERE id = ?').run(r.id);
    }),
  );

  // Quotes

  api.get(
    '/quotes',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      if (req.query.clientId) (where.push('q.client_id = ?'), params.push(Number(req.query.clientId)));
      if (req.query.divisionId) (where.push('q.division_id = ?'), params.push(Number(req.query.divisionId)));
      if (req.query.status) (where.push('q.status = ?'), params.push(String(req.query.status)));
      return db
        .prepare(`${QUOTE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY q.created_at DESC, q.id DESC`)
        .all(...params)
        .map(mapQuote);
    }),
  );

  // A quote without a request (e.g. quoted over the phone).
  api.post(
    '/quotes',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const b = req.body;
      const client = getClient(db, Number(b.clientId));
      if (!client) throw new HttpError(400, 'Client not found');
      const title = required(b, 'title');
      const number = nextNumber(db, 'quotes', 'Q');
      const r = db
        .prepare('INSERT INTO quotes (number, client_id, division_id, title, description, address, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          number,
          client.id,
          Number(b.divisionId),
          title,
          String(b.description ?? ''),
          b.address || client.address,
          staffUser(req)?.id ?? null,
          localDateTime(),
        );
      const quoteId = Number(r.lastInsertRowid);
      logActivity(db, 'quote', `New quote ${number}: ${title}`, { quoteId });
      return getQuote(db, quoteId);
    }),
  );

  api.get(
    '/quotes/:id',
    h((req) => ({ ...getQuoteDetail(db, id(req)), chain: chainFor(db, 'quote', id(req)), defaultDepositPercent: getCompany(db).depositPercent })),
  );

  const editable = (q: Quote) => {
    if (q.status === 'converted' || q.status === 'approved') throw new HttpError(409, 'An approved quote can’t be changed. Make changes on the job.');
  };

  api.patch(
    '/quotes/:id',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const q = getQuote(db, id(req));
      const b = req.body;
      if (b.status !== undefined) {
        const status = b.status as QuoteStatus;
        if (!QUOTE_STATUSES.includes(status) || ['approved', 'converted'].includes(status)) throw new HttpError(400, 'Use Approve or Convert to job');
        if (q.status === 'converted') throw new HttpError(409, 'This quote is already a job');
        db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, q.id);
        logActivity(db, 'quote', `Quote ${q.number} marked ${status.replace('_', ' ')}`, { quoteId: q.id });
      }
      const fields = ['title', 'description', 'address', 'depositPercent', 'divisionId'].filter((k) => k in b);
      if (fields.length) {
        editable(q);
        const pct =
          'depositPercent' in b
            ? b.depositPercent === null || b.depositPercent === ''
              ? null
              : Math.min(100, Math.max(0, Number(b.depositPercent)))
            : q.depositPercent;
        db.prepare('UPDATE quotes SET title = ?, description = ?, address = ?, deposit_percent = ?, division_id = ? WHERE id = ?').run(
          'title' in b ? String(b.title).trim() || q.title : q.title,
          'description' in b ? String(b.description) : q.description,
          'address' in b ? b.address || null : q.address,
          pct,
          'divisionId' in b ? Number(b.divisionId) : q.divisionId,
          q.id,
        );
      }
      return getQuoteDetail(db, q.id);
    }),
  );

  api.post(
    '/quotes/:id/items',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const q = getQuote(db, id(req));
      editable(q);
      const i = itemInput(req.body);
      db.prepare('INSERT INTO quote_items (quote_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(q.id, i.description, i.quantity, i.unitPrice);
      return getQuoteDetail(db, q.id);
    }),
  );

  api.patch(
    '/quote-items/:id',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const row = db.prepare('SELECT * FROM quote_items WHERE id = ?').get(id(req)) as Row | undefined;
      if (!row) throw new HttpError(404, 'Line item not found');
      editable(getQuote(db, row.quote_id));
      const i = itemInput({ description: row.description, quantity: row.quantity, unitPrice: row.unit_price, ...req.body });
      db.prepare('UPDATE quote_items SET description = ?, quantity = ?, unit_price = ? WHERE id = ?').run(i.description, i.quantity, i.unitPrice, row.id);
      return getQuoteDetail(db, row.quote_id);
    }),
  );

  api.delete(
    '/quote-items/:id',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const row = db.prepare('SELECT * FROM quote_items WHERE id = ?').get(id(req)) as Row | undefined;
      if (!row) return;
      editable(getQuote(db, row.quote_id));
      db.prepare('DELETE FROM quote_items WHERE id = ?').run(row.id);
      return getQuoteDetail(db, row.quote_id);
    }),
  );

  /** Mark the quote sent (the client can now approve it in their portal). Texting it is a separate action. */
  api.post(
    '/quotes/:id/send',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const q = getQuote(db, id(req));
      editable(q);
      if (q.total <= 0) throw new HttpError(400, 'Add line items before sending the quote');
      db.prepare("UPDATE quotes SET status = 'sent', sent_at = ?, followup_count = 0, last_followup_on = NULL WHERE id = ?").run(localDateTime(), q.id);
      logActivity(db, 'quote', `Quote ${q.number} sent to the client ($${q.total.toFixed(2)})`, { quoteId: q.id });
      return getQuoteDetail(db, q.id);
    }),
  );

  /** The office records an approval given by phone, email or on paper. */
  api.post(
    '/quotes/:id/approve',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const me = staffUser(req)!;
      return tx(db, () => {
        const q = approveQuote(db, id(req), { staffName: me.name });
        logActivity(db, 'quote', `${me.name} recorded the client's approval of ${q.number}`, { quoteId: q.id });
        const pct = q.depositPercent ?? getCompany(db).depositPercent;
        if (pct > 0 && q.total > 0) createDepositInvoice(db, q, pct);
        return getQuoteDetail(db, q.id);
      });
    }),
  );

  api.post(
    '/quotes/:id/job',
    h((req) => {
      assertCan(req, 'manage_jobs');
      return convertQuoteToJob(db, id(req));
    }),
  );

  api.delete(
    '/quotes/:id',
    h((req) => {
      assertCan(req, 'manage_jobs');
      const q = getQuote(db, id(req));
      if (q.status !== 'draft') throw new HttpError(409, 'Only draft quotes can be deleted. Mark it declined instead.');
      db.prepare('DELETE FROM quotes WHERE id = ?').run(q.id);
      if (q.requestId) db.prepare("UPDATE requests SET status = 'new' WHERE id = ? AND status = 'converted'").run(q.requestId);
    }),
  );

  // The chain from any step, for the breadcrumb on each page.
  for (const kind of ['request', 'quote', 'job', 'invoice'] as const) {
    api.get(
      `/${kind}s/:id/chain`,
      h((req) => chainFor(db, kind, id(req))),
    );
  }

  /** Everything done for a client, grouped into chains (request → quote → job → invoices), newest first. */
  api.get(
    '/clients/:id/work',
    h((req) => {
      const clientId = id(req);
      const seen = { request: new Set<number>(), quote: new Set<number>(), job: new Set<number>(), invoice: new Set<number>() };
      const out: { title: string; divisionId: number | null; date: string; chain: Chain }[] = [];
      const add = (kind: 'request' | 'quote' | 'job' | 'invoice', rowId: number, title: string, divisionId: number | null, date: string) => {
        if (seen[kind].has(rowId)) return;
        const chain = chainFor(db, kind, rowId);
        if (chain.request) seen.request.add(chain.request.id);
        if (chain.quote) seen.quote.add(chain.quote.id);
        if (chain.job) seen.job.add(chain.job.id);
        chain.invoices.forEach((i) => seen.invoice.add(i.id));
        if (kind === 'invoice') seen.invoice.add(rowId);
        out.push({ title, divisionId, date, chain });
      };
      // Latest step first decides the title/date shown; walk from the end of the chain backwards.
      for (const j of db
        .prepare('SELECT id, title, division_id, COALESCE(completed_at, scheduled_start, created_at) AS d FROM jobs WHERE client_id = ? ORDER BY id DESC')
        .all(clientId) as Row[])
        add('job', j.id, j.title, j.division_id, j.d);
      for (const q of db.prepare('SELECT id, title, division_id, created_at FROM quotes WHERE client_id = ? ORDER BY id DESC').all(clientId) as Row[])
        add('quote', q.id, q.title, q.division_id, q.created_at);
      for (const r of db.prepare('SELECT id, title, division_id, created_at FROM requests WHERE client_id = ? ORDER BY id DESC').all(clientId) as Row[])
        add('request', r.id, r.title, r.division_id, r.created_at);
      for (const i of db.prepare('SELECT id, number, division_id, issue_date FROM invoices WHERE client_id = ? ORDER BY id DESC').all(clientId) as Row[])
        add('invoice', i.id, `Invoice ${i.number}`, i.division_id, i.issue_date);
      return out.sort((a, b) => b.date.localeCompare(a.date));
    }),
  );

  // Activity for a request or quote page.
  api.get(
    '/requests/:id/activity',
    h((req) => db.prepare('SELECT * FROM activity WHERE request_id = ? ORDER BY id DESC LIMIT 50').all(id(req))),
  );
  api.get(
    '/quotes/:id/activity',
    h((req) => db.prepare('SELECT * FROM activity WHERE quote_id = ? ORDER BY id DESC LIMIT 50').all(id(req))),
  );

  return api;
}

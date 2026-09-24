// Invoices: create from a job, edit while unpaid, send, record payments, and a public client view.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { logActivity, tx, type DB } from './db.ts';
import { h, id, optNum, patch, required } from './http.ts';
import { setJobStatus } from './automations.ts';
import { HttpError, getClient, getJob, localDate, mapLineItem } from './repo.ts';
import { DEFAULT_BRAND, DEFAULT_LOGO } from '../shared/brand.ts';
import { PAYMENT_METHODS, type CompanySettings, type Invoice, type InvoiceDetail, type InvoiceItem, type Payment } from '../shared/types.ts';

type Row = Record<string, any>;

const DEFAULT_COMPANY: CompanySettings = {
  name: 'Big Country Cleanup & Restoration',
  phone: '',
  email: '',
  address: '',
  paymentTermsDays: 30,
  defaultTaxRate: 0,
  invoiceFooter: 'Thank you for your business!',
  logo: DEFAULT_LOGO,
  ...DEFAULT_BRAND,
};

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_CHARS = 2_000_000; // ~1.5 MB image

export function getCompany(db: DB): CompanySettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'company'").get();
  return { ...DEFAULT_COMPANY, ...(row ? JSON.parse(row.value as string) : {}) };
}

const INVOICE_SELECT = `
  SELECT i.*,
    COALESCE((SELECT SUM(quantity * unit_price) FROM invoice_items it WHERE it.invoice_id = i.id), 0) AS subtotal,
    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
  FROM invoices i`;

const cents = (n: number) => Math.round(n * 100) / 100;

function mapInvoice(r: Row): Invoice {
  const subtotal = cents(r.subtotal);
  const tax = cents((subtotal * r.tax_rate) / 100);
  const total = cents(subtotal + tax);
  const amountPaid = cents(r.paid);
  const balance = r.status === 'void' ? 0 : cents(total - amountPaid);
  return {
    id: r.id,
    number: r.number,
    jobId: r.job_id,
    clientId: r.client_id,
    divisionId: r.division_id,
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    taxRate: r.tax_rate,
    notes: r.notes,
    publicToken: r.public_token,
    subtotal,
    tax,
    total,
    amountPaid,
    balance,
    overdue: r.status === 'sent' && balance > 0 && r.due_date < localDate(),
    createdAt: r.created_at,
  };
}

const mapItem = (r: Row): InvoiceItem => ({ id: r.id, invoiceId: r.invoice_id, description: r.description, quantity: r.quantity, unitPrice: r.unit_price });
const mapPayment = (r: Row): Payment => ({ id: r.id, invoiceId: r.invoice_id, amount: r.amount, method: r.method, paidOn: r.paid_on, note: r.note });

function getInvoice(db: DB, invoiceId: number): Invoice {
  const row = db.prepare(`${INVOICE_SELECT} WHERE i.id = ?`).get(invoiceId);
  if (!row) throw new HttpError(404, 'Invoice not found');
  return mapInvoice(row);
}

function getDetail(db: DB, invoiceId: number): InvoiceDetail {
  const inv = getInvoice(db, invoiceId);
  return {
    ...inv,
    items: db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(inv.id).map(mapItem),
    payments: db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_on, id').all(inv.id).map(mapPayment),
    client: getClient(db, inv.clientId)!,
    job: inv.jobId ? (getJob(db, inv.jobId) ?? null) : null,
  };
}

function assertEditable(inv: Invoice) {
  if (inv.status === 'paid' || inv.status === 'void') throw new HttpError(409, `A ${inv.status} invoice can't be edited`);
}

/** Paid ↔ sent follows the balance; a fully paid job-linked invoice moves the job to Paid. */
function reconcile(db: DB, invoiceId: number): string[] {
  const inv = getInvoice(db, invoiceId);
  if (inv.status === 'void' || inv.status === 'draft') return [];
  const next = inv.balance <= 0 && inv.total > 0 ? 'paid' : 'sent';
  if (next !== inv.status) db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(next, inv.id);
  if (next === 'paid' && inv.jobId) {
    const unpaid = db
      .prepare("SELECT COUNT(*) AS n FROM invoices WHERE job_id = ? AND status IN ('draft', 'sent')")
      .get(inv.jobId) as { n: number };
    if (unpaid.n === 0) return setJobStatus(db, inv.jobId, 'paid');
  }
  return [];
}

export function createInvoicesApi(db: DB): Router {
  const api = Router();

  api.get(
    '/settings/company',
    h(() => getCompany(db)),
  );

  api.put(
    '/settings/company',
    h((req) => {
      const merged = { ...getCompany(db), ...req.body };
      if (!HEX.test(merged.brandColor) || !HEX.test(merged.accentColor)) throw new HttpError(400, 'Colors must be hex values like #184478');
      if (merged.logo !== null && (typeof merged.logo !== 'string' || !LOGO.test(merged.logo))) {
        throw new HttpError(400, 'Logo must be a PNG, JPEG or WebP image');
      }
      if (merged.logo && merged.logo.length > MAX_LOGO_CHARS) throw new HttpError(413, 'Logo image is too large (max 1.5 MB)');
      merged.paymentTermsDays = Math.max(0, Number(merged.paymentTermsDays) || 0);
      merged.defaultTaxRate = Math.max(0, Number(merged.defaultTaxRate) || 0);
      db.prepare("INSERT INTO settings (key, value) VALUES ('company', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
        JSON.stringify(merged),
      );
      return getCompany(db);
    }),
  );

  api.get(
    '/invoices',
    h((req) => {
      const where: string[] = [];
      const params: any[] = [];
      const q = req.query;
      if (q.clientId) (where.push('i.client_id = ?'), params.push(Number(q.clientId)));
      if (q.jobId) (where.push('i.job_id = ?'), params.push(Number(q.jobId)));
      if (q.divisionId) (where.push('i.division_id = ?'), params.push(Number(q.divisionId)));
      return db
        .prepare(`${INVOICE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.issue_date DESC, i.id DESC`)
        .all(...params)
        .map(mapInvoice);
    }),
  );

  /** Create from a job (copies its line items) or blank for a client. */
  api.post(
    '/invoices',
    h((req) => {
      const company = getCompany(db);
      const job = req.body.jobId ? getJob(db, Number(req.body.jobId)) : undefined;
      if (req.body.jobId && !job) throw new HttpError(400, 'Job not found');
      const clientId = job?.clientId ?? Number(req.body.clientId);
      if (!getClient(db, clientId)) throw new HttpError(400, 'Client not found');
      const terms = req.body.dueInDays != null ? Number(req.body.dueInDays) : company.paymentTermsDays;
      return tx(db, () => {
        const next = db.prepare('SELECT COALESCE(MAX(id), 0) + 1001 AS n FROM invoices').get() as { n: number };
        const r = db
          .prepare(
            `INSERT INTO invoices (number, job_id, client_id, division_id, issue_date, due_date, tax_rate, notes, public_token)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            `INV-${next.n}`,
            job?.id ?? null,
            clientId,
            job?.divisionId ?? optNum(req.body.divisionId),
            localDate(),
            localDate(terms),
            req.body.taxRate != null ? Number(req.body.taxRate) : company.defaultTaxRate,
            req.body.notes || null,
            randomBytes(16).toString('hex'),
          );
        const invoiceId = Number(r.lastInsertRowid);
        if (job) {
          const items = db.prepare('SELECT * FROM line_items WHERE job_id = ? ORDER BY id').all(job.id).map(mapLineItem);
          for (const li of items) {
            db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(
              invoiceId,
              li.description,
              li.quantity,
              li.unitPrice,
            );
          }
          logActivity(db, 'invoice', `Created invoice INV-${next.n} for ${job.number}`, { jobId: job.id });
        }
        return getDetail(db, invoiceId);
      });
    }),
  );

  api.get(
    '/invoices/:id',
    h((req) => getDetail(db, id(req))),
  );

  api.patch(
    '/invoices/:id',
    h((req) => {
      assertEditable(getInvoice(db, id(req)));
      patch(db, 'invoices', id(req), req.body, {
        issueDate: 'issue_date',
        dueDate: 'due_date',
        notes: 'notes',
        taxRate: (v) => ['tax_rate', Math.max(0, Number(v) || 0)],
      });
      reconcile(db, id(req));
      return getDetail(db, id(req));
    }),
  );

  api.delete(
    '/invoices/:id',
    h((req) => {
      if (getInvoice(db, id(req)).status !== 'draft') throw new HttpError(409, 'Only drafts can be deleted; void it instead');
      db.prepare('DELETE FROM invoices WHERE id = ?').run(id(req));
    }),
  );

  api.post(
    '/invoices/:id/items',
    h((req) => {
      assertEditable(getInvoice(db, id(req)));
      db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES (?, ?, ?, ?)').run(
        id(req),
        required(req.body, 'description'),
        Number(req.body.quantity) || 1,
        Number(req.body.unitPrice) || 0,
      );
      reconcile(db, id(req));
      return getDetail(db, id(req));
    }),
  );

  api.patch(
    '/invoice-items/:id',
    h((req) => {
      const item = db.prepare('SELECT invoice_id FROM invoice_items WHERE id = ?').get(id(req)) as { invoice_id: number } | undefined;
      if (!item) throw new HttpError(404, 'Item not found');
      assertEditable(getInvoice(db, item.invoice_id));
      patch(db, 'invoice_items', id(req), req.body, {
        description: 'description',
        quantity: (v) => ['quantity', Number(v) || 0],
        unitPrice: (v) => ['unit_price', Number(v) || 0],
      });
      reconcile(db, item.invoice_id);
      return getDetail(db, item.invoice_id);
    }),
  );

  api.delete(
    '/invoice-items/:id',
    h((req) => {
      const item = db.prepare('SELECT invoice_id FROM invoice_items WHERE id = ?').get(id(req)) as { invoice_id: number } | undefined;
      if (!item) return;
      assertEditable(getInvoice(db, item.invoice_id));
      db.prepare('DELETE FROM invoice_items WHERE id = ?').run(id(req));
      reconcile(db, item.invoice_id);
      return getDetail(db, item.invoice_id);
    }),
  );

  /** Mark as sent to the client. Moves the linked job to Invoiced. */
  api.post(
    '/invoices/:id/send',
    h((req) => {
      const inv = getInvoice(db, id(req));
      if (inv.status !== 'draft') throw new HttpError(409, 'Only drafts can be sent');
      if (inv.total <= 0) throw new HttpError(400, 'Add at least one line item before sending');
      return tx(db, () => {
        db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(inv.id);
        let automations: string[] = [];
        if (inv.jobId) {
          logActivity(db, 'invoice', `Sent ${inv.number}`, { jobId: inv.jobId });
          const job = getJob(db, inv.jobId);
          if (job && job.status !== 'paid') automations = setJobStatus(db, job.id, 'invoiced');
        }
        return { ...getDetail(db, inv.id), automations };
      });
    }),
  );

  api.post(
    '/invoices/:id/payments',
    h((req) => {
      const inv = getInvoice(db, id(req));
      if (inv.status === 'draft' || inv.status === 'void') throw new HttpError(409, `Can't record a payment on a ${inv.status} invoice`);
      const amount = cents(Number(req.body.amount));
      if (!(amount > 0)) throw new HttpError(400, 'Payment amount must be greater than 0');
      const method = PAYMENT_METHODS.includes(req.body.method) ? req.body.method : 'Other';
      return tx(db, () => {
        db.prepare('INSERT INTO payments (invoice_id, amount, method, paid_on, note) VALUES (?, ?, ?, ?, ?)').run(
          inv.id,
          amount,
          method,
          req.body.paidOn || localDate(),
          req.body.note || null,
        );
        if (inv.jobId) logActivity(db, 'invoice', `Recorded $${amount.toFixed(2)} ${method} payment on ${inv.number}`, { jobId: inv.jobId });
        const automations = reconcile(db, inv.id);
        return { ...getDetail(db, inv.id), automations };
      });
    }),
  );

  api.delete(
    '/payments/:id',
    h((req) => {
      const p = db.prepare('SELECT invoice_id FROM payments WHERE id = ?').get(id(req)) as { invoice_id: number } | undefined;
      if (!p) return;
      db.prepare('DELETE FROM payments WHERE id = ?').run(id(req));
      reconcile(db, p.invoice_id);
      return getDetail(db, p.invoice_id);
    }),
  );

  api.post(
    '/invoices/:id/void',
    h((req) => {
      const inv = getInvoice(db, id(req));
      if (inv.amountPaid > 0) throw new HttpError(409, 'Remove payments before voiding');
      db.prepare("UPDATE invoices SET status = 'void' WHERE id = ?").run(inv.id);
      return getDetail(db, inv.id);
    }),
  );

  // What the client sees from their link. No internal ids beyond what's on a paper invoice.
  api.get(
    '/public/invoices/:token',
    h((req) => {
      const row = db.prepare('SELECT id FROM invoices WHERE public_token = ?').get(String(req.params.token));
      if (!row) throw new HttpError(404, 'Invoice not found');
      const d = getDetail(db, row.id as number);
      if (d.status === 'draft') throw new HttpError(404, 'Invoice not found');
      return {
        company: getCompany(db),
        invoice: { ...d, job: d.job ? { number: d.job.number, title: d.job.title, address: d.job.address } : null },
      };
    }),
  );

  return api;
}

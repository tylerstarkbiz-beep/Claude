// Job costing: labor (time × each person's rate) plus entered costs, rolled up to profit and margin.
import { Router } from 'express';
import type { DB } from './db.ts';
import { h, id, optNum } from './http.ts';
import { HttpError, getJob, localDate, localDateTime } from './repo.ts';
import { COST_CATEGORIES, type JobCost, type JobCosting, type ProfitRow } from '../shared/types.ts';

type Row = Record<string, any>;
const cents = (n: number) => Math.round(n * 100) / 100;
const margin = (profit: number, revenue: number) => (revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null);

// Open entries count up to now. Rate is the one saved on the entry, falling back to the person's current rate.
const MINUTES = `(julianday(COALESCE(te.ended_at, :now)) - julianday(te.started_at)) * 1440`;
const RATE = `COALESCE(te.hourly_rate, u.hourly_rate, 0)`;

const mapCost = (r: Row): JobCost => ({
  id: r.id,
  jobId: r.job_id,
  category: r.category,
  description: r.description,
  amount: r.amount,
  date: r.date,
  createdBy: r.created_by,
});

export function jobCosting(db: DB, jobId: number): JobCosting {
  const job = getJob(db, jobId);
  if (!job) throw new HttpError(404, 'Job not found');
  const labor = (
    db
      .prepare(
        `SELECT te.user_id, SUM(${MINUTES}) AS minutes, SUM(${MINUTES} / 60.0 * ${RATE}) AS cost
         FROM time_entries te JOIN users u ON u.id = te.user_id
         WHERE te.job_id = :job GROUP BY te.user_id ORDER BY cost DESC`,
      )
      .all({ now: localDateTime(), job: jobId }) as Row[]
  ).map((r) => ({
    userId: r.user_id as number,
    minutes: Math.round(r.minutes),
    cost: cents(r.cost),
    // Average from exact time (a running timer has fractional minutes), so a flat $29/hr shows as $29.
    rate: r.minutes > 0 ? cents(r.cost / (r.minutes / 60)) : 0,
  }));
  const costs = db.prepare('SELECT * FROM job_costs WHERE job_id = ? ORDER BY date, id').all(jobId).map(mapCost);
  const invoiced = db
    .prepare(
      `SELECT COALESCE(SUM((SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items it WHERE it.invoice_id = i.id) * (1 + i.tax_rate / 100.0)), 0) AS n
       FROM invoices i WHERE i.job_id = ? AND i.status IN ('sent', 'paid')`,
    )
    .get(jobId) as { n: number };

  const laborCost = cents(labor.reduce((a, l) => a + l.cost, 0));
  const otherCosts = cents(costs.reduce((a, c) => a + c.amount, 0));
  const totalCost = cents(laborCost + otherCosts);
  const profit = cents(job.total - totalCost);
  return {
    revenue: job.total,
    invoiced: cents(invoiced.n),
    laborMinutes: labor.reduce((a, l) => a + l.minutes, 0),
    laborCost,
    labor,
    costs,
    otherCosts,
    totalCost,
    profit,
    margin: margin(profit, job.total),
  };
}

export interface ProfitFilter {
  divisionId?: number | null;
  /** Completed-on range (YYYY-MM-DD, inclusive). Only applies to completed jobs. */
  from?: string | null;
  to?: string | null;
  /** Also include jobs still in progress (work in progress, costs so far). */
  includeOpen?: boolean;
  jobIds?: number[];
}

export function profitRows(db: DB, f: ProfitFilter = {}): ProfitRow[] {
  const where: string[] = [];
  const params: Record<string, any> = { now: localDateTime() };
  if (f.jobIds) {
    if (!f.jobIds.length) return [];
    where.push(`j.id IN (${f.jobIds.map((_, i) => `:j${i}`).join(',')})`);
    f.jobIds.forEach((v, i) => (params[`j${i}`] = v));
  } else if (f.includeOpen) {
    where.push("(j.completed_at IS NOT NULL OR j.status IN ('scheduled', 'in_progress'))");
  } else {
    where.push('j.completed_at IS NOT NULL');
  }
  if (f.divisionId) (where.push('j.division_id = :division'), (params.division = f.divisionId));
  if (f.from) (where.push('(j.completed_at IS NULL OR substr(j.completed_at, 1, 10) >= :from)'), (params.from = f.from));
  if (f.to) (where.push('(j.completed_at IS NULL OR substr(j.completed_at, 1, 10) <= :to)'), (params.to = f.to));

  const rows = db
    .prepare(
      `SELECT j.id, j.number, j.title, j.client_id, j.division_id, j.status, j.completed_at,
         COALESCE((SELECT SUM(quantity * unit_price) FROM line_items li WHERE li.job_id = j.id), 0) AS revenue,
         COALESCE((SELECT SUM(${MINUTES}) FROM time_entries te JOIN users u ON u.id = te.user_id WHERE te.job_id = j.id), 0) AS labor_minutes,
         COALESCE((SELECT SUM(${MINUTES} / 60.0 * ${RATE}) FROM time_entries te JOIN users u ON u.id = te.user_id WHERE te.job_id = j.id), 0) AS labor_cost,
         COALESCE((SELECT SUM(amount) FROM job_costs c WHERE c.job_id = j.id), 0) AS other_costs
       FROM jobs j WHERE ${where.join(' AND ')} AND j.status != 'cancelled'
       ORDER BY COALESCE(j.completed_at, j.scheduled_start) DESC`,
    )
    .all(params) as Row[];

  return rows.map((r) => {
    const revenue = cents(r.revenue);
    const laborCost = cents(r.labor_cost);
    const otherCosts = cents(r.other_costs);
    const profit = cents(revenue - laborCost - otherCosts);
    return {
      jobId: r.id,
      number: r.number,
      title: r.title,
      clientId: r.client_id,
      divisionId: r.division_id,
      status: r.status,
      completedAt: r.completed_at,
      revenue,
      laborMinutes: Math.round(r.labor_minutes),
      laborCost,
      otherCosts,
      profit,
      margin: margin(profit, revenue),
    };
  });
}

function costInput(b: Row) {
  const amount = cents(Number(b.amount));
  if (!Number.isFinite(amount) || amount === 0) throw new HttpError(400, 'Enter a cost amount');
  const category = COST_CATEGORIES.includes(b.category) ? b.category : 'Other';
  return { amount, category, description: String(b.description ?? '').trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : localDate() };
}

export function createCostingApi(db: DB): Router {
  const api = Router();

  api.get(
    '/jobs/:id/costing',
    h((req) => jobCosting(db, id(req))),
  );

  api.post(
    '/jobs/:id/costs',
    h((req) => {
      if (!getJob(db, id(req))) throw new HttpError(404, 'Job not found');
      const c = costInput(req.body);
      db.prepare('INSERT INTO job_costs (job_id, category, description, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
        id(req),
        c.category,
        c.description,
        c.amount,
        c.date,
        optNum(req.body.createdBy),
      );
      return jobCosting(db, id(req));
    }),
  );

  api.patch(
    '/job-costs/:id',
    h((req) => {
      const row = db.prepare('SELECT * FROM job_costs WHERE id = ?').get(id(req));
      if (!row) throw new HttpError(404, 'Cost not found');
      const c = costInput({ ...mapCost(row), ...req.body });
      db.prepare('UPDATE job_costs SET category = ?, description = ?, amount = ?, date = ? WHERE id = ?').run(c.category, c.description, c.amount, c.date, id(req));
      return jobCosting(db, row.job_id as number);
    }),
  );

  api.delete(
    '/job-costs/:id',
    h((req) => {
      const row = db.prepare('SELECT job_id FROM job_costs WHERE id = ?').get(id(req));
      if (!row) return;
      db.prepare('DELETE FROM job_costs WHERE id = ?').run(id(req));
      return jobCosting(db, row.job_id as number);
    }),
  );

  api.get(
    '/reports/profitability',
    h((req) =>
      profitRows(db, {
        divisionId: optNum(req.query.divisionId),
        from: typeof req.query.from === 'string' ? req.query.from : null,
        to: typeof req.query.to === 'string' ? req.query.to : null,
        includeOpen: req.query.includeOpen === '1',
      }),
    ),
  );

  return api;
}

// Stripe: saved cards and card payments. Card numbers never reach this server; the browser sends
// them straight to Stripe (Stripe Elements) and we only handle Stripe ids.
// Turned on by STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY; tests inject a fake `call`.
import type { DB } from './db.ts';
import { HttpError } from './repo.ts';

export type StripeCall = (method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, unknown>, idempotencyKey?: string) => Promise<any>;

export interface Payments {
  enabled: boolean;
  publishableKey: string | null;
  call: StripeCall;
}

/** Stripe's form encoding: { a: { b: 1 }, c: ['x'] } → a[b]=1&c[0]=x */
function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...encode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export function stripeFromEnv(): Payments {
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null;
  const call: StripeCall = async (method, path, params = {}, idempotencyKey) => {
    if (!secret) throw new HttpError(503, 'Card payments are not set up');
    const body = encode(params).join('&');
    const url = `https://api.stripe.com${path}${method === 'GET' && body ? `?${body}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: method === 'GET' ? undefined : body,
    });
    const data = await res.json();
    if (!res.ok) {
      const e = data?.error ?? {};
      // Card declines come back as 402; show Stripe's message ("Your card was declined.").
      throw new HttpError(res.status === 402 ? 402 : 502, e.message ?? 'Payment provider error');
    }
    return data;
  };
  return { enabled: !!(secret && publishableKey), publishableKey, call };
}

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

/** The client's Stripe customer id, creating the customer on first use. */
export async function ensureCustomer(db: DB, pay: Payments, clientId: number): Promise<string> {
  const c = db.prepare('SELECT id, name, email, phone, stripe_customer_id FROM clients WHERE id = ?').get(clientId) as Record<string, any> | undefined;
  if (!c) throw new HttpError(404, 'Client not found');
  if (c.stripe_customer_id) return c.stripe_customer_id;
  const customer = await pay.call('POST', '/v1/customers', {
    name: c.name,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    metadata: { client_id: c.id },
  }, `customer-client-${c.id}`);
  db.prepare('UPDATE clients SET stripe_customer_id = ? WHERE id = ?').run(customer.id, c.id);
  return customer.id;
}

export async function listCards(pay: Payments, customerId: string): Promise<SavedCard[]> {
  const [methods, customer] = await Promise.all([
    pay.call('GET', '/v1/payment_methods', { customer: customerId, type: 'card' }),
    pay.call('GET', `/v1/customers/${customerId}`),
  ]);
  const def = customer?.invoice_settings?.default_payment_method;
  return (methods.data ?? []).map((pm: any, i: number) => ({
    id: pm.id,
    brand: pm.card?.brand ?? 'card',
    last4: pm.card?.last4 ?? '????',
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
    isDefault: def ? pm.id === def : i === 0,
  }));
}

/** Make sure a payment method belongs to this customer before using or removing it. */
export async function assertOwnCard(pay: Payments, customerId: string, paymentMethodId: string) {
  if (!/^pm_[A-Za-z0-9_]+$/.test(paymentMethodId)) throw new HttpError(400, 'Invalid card');
  const pm = await pay.call('GET', `/v1/payment_methods/${paymentMethodId}`);
  if (pm.customer !== customerId) throw new HttpError(404, 'Card not found');
}

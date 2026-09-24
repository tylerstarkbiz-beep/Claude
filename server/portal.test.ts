import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';
import type { Payments } from './stripe.ts';

/** Sign a client in the way the invite email would: office creates a link, client opens it. */
async function signIn(call: Awaited<ReturnType<typeof setup>>['call'], clientId: number) {
  const { data } = await call('POST', `/clients/${clientId}/portal/link`);
  const token = new URLSearchParams(data.link.split('?')[1]).get('token');
  const res = await call('POST', '/portal/auth/redeem', { token });
  assert.equal(res.status, 200);
  return { session: res.data.session as string, token: token! };
}

// 1x1 PNG standing in for a drawn signature
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const clientId = (db: any, name: string) => (db.prepare('SELECT id FROM clients WHERE name = ?').get(name) as { id: number }).id;

test('a new client automatically gets a portal invite; links are single-use; logout ends the session', async () => {
  const { call, close } = await setup();
  const { data: client } = await call('POST', '/clients', { name: 'Pat Doe', email: 'pat@example.com' });
  const { data: portal } = await call('GET', `/clients/${client.id}/portal`);
  assert.equal(portal.enabled, true);
  assert.equal(portal.emails.length, 1);
  assert.match(portal.emails[0].subject, /customer portal/);
  assert.equal(portal.emails[0].status, 'not_configured', 'no email service in tests, so it waits in the outbox');

  const token = new URLSearchParams(portal.emails[0].link.split('?')[1]).get('token');
  const first = await call('POST', '/portal/auth/redeem', { token });
  assert.equal(first.status, 200);
  assert.equal((await call('POST', '/portal/auth/redeem', { token })).status, 401, 'link works once');

  const me = await call('GET', '/portal/me', undefined, first.data.session);
  assert.equal(me.data.client.name, 'Pat Doe');
  assert.equal((await call('GET', '/portal/me')).status, 401, 'no session, no data');

  await call('POST', '/portal/auth/logout', undefined, first.data.session);
  assert.equal((await call('GET', '/portal/me', undefined, first.data.session)).status, 401);

  // A client without an email still gets a portal (the office can copy the link) but no email.
  const { data: noEmail } = await call('POST', '/clients', { name: 'No Email' });
  assert.equal((await call('GET', `/clients/${noEmail.id}/portal`)).data.emails.length, 0);
  close();
});

test("clients only ever see their own records", async () => {
  const { call, db, close } = await setup();
  const harper = clientId(db, 'Linda Harper');
  const gonzalez = clientId(db, 'Maria Gonzalez');
  const { session } = await signIn(call, harper);

  const { data: jobs } = await call('GET', '/portal/jobs', undefined, session);
  const all = db.prepare('SELECT id, client_id FROM jobs').all() as { id: number; client_id: number }[];
  assert.ok(jobs.length > 0);
  assert.ok(jobs.every((j: any) => all.find((a) => a.id === j.id)!.client_id === harper));
  assert.ok(!('customFields' in jobs[0]) && !('assigneeId' in jobs[0]), 'internal fields are not exposed');

  const theirInvoice = db.prepare("SELECT id FROM invoices WHERE client_id = ? AND status != 'draft'").get(gonzalez) as { id: number };
  assert.equal((await call('GET', `/portal/invoices/${theirInvoice.id}`, undefined, session)).status, 404);
  const theirQuote = db.prepare("SELECT id FROM jobs WHERE client_id != ? AND status = 'quoted'").get(harper) as { id: number };
  assert.equal((await call('POST', `/portal/estimates/${theirQuote.id}/approve`, undefined, session)).status, 404);
  assert.equal((await call('POST', `/portal/invoices/${theirInvoice.id}/pay`, { paymentMethodId: 'pm_x' }, session)).status, 503);
  close();
});

test('portal requests become jobs and run automations; estimates can be approved or questioned', async () => {
  const { call, db, close } = await setup();
  const wells = clientId(db, 'David & Karen Wells');
  const { session } = await signIn(call, wells);
  const { data: me } = await call('GET', '/portal/me', undefined, session);
  const restoration = me.divisions.find((d: any) => d.name === 'Restoration');

  const req = await call('POST', '/portal/requests', { divisionId: restoration.id, description: 'Water under the sink', preferredTimes: 'Mornings' }, session);
  assert.equal(req.status, 200);
  assert.equal(req.data.status, 'request');
  const row = db.prepare('SELECT source, description FROM jobs WHERE id = ?').get(req.data.id) as { source: string; description: string };
  assert.equal(row.source, 'portal');
  assert.match(row.description, /Preferred times: Mornings/);
  const task = db.prepare("SELECT title FROM tasks WHERE job_id = ? AND title LIKE 'Contact adjuster%'").get(req.data.id);
  assert.ok(task, 'the "new restoration loss" automation ran');

  const quote = (await call('GET', '/portal/jobs', undefined, session)).data.find((j: any) => j.status === 'quoted');
  assert.equal((await call('POST', `/portal/estimates/${quote.id}/approve`, {}, session)).status, 400, 'a signature is required');
  const approved = await call('POST', `/portal/estimates/${quote.id}/approve`, { signatureName: 'David Wells', signature: SIG }, session);
  assert.ok(approved.data.approvedAt);
  assert.equal(approved.data.signature.name, 'David Wells');
  await call('POST', `/portal/estimates/${quote.id}/changes`, { message: 'Can you start next week?' }, session);
  const note = db.prepare('SELECT body FROM job_notes WHERE job_id = ? ORDER BY id DESC').get(quote.id) as { body: string };
  assert.match(note.body, /From David & Karen Wells \(portal\): Can you start next week\?/);
  close();
});

test('email sign-in: unknown emails get the same answer; turning the portal off signs the client out', async () => {
  const { call, db, close } = await setup();
  const before = (db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n;
  assert.equal((await call('POST', '/portal/auth/request', { email: 'nobody@example.com' })).status, 200);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n, before);
  await call('POST', '/portal/auth/request', { email: 'LINDA.HARPER@example.com' });
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n, before + 1);

  const harper = clientId(db, 'Linda Harper');
  const { session } = await signIn(call, harper);
  await call('PATCH', `/clients/${harper}/portal`, { enabled: false });
  assert.equal((await call('GET', '/portal/me', undefined, session)).status, 401);
  close();
});

/** In-memory stand-in for the parts of Stripe's API the app uses. */
function fakeStripe() {
  const customers = new Map<string, any>();
  const methods = new Map<string, any>([
    ['pm_visa', { id: 'pm_visa', customer: null, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 } }],
    ['pm_3ds', { id: 'pm_3ds', customer: null, card: { brand: 'visa', last4: '3155', exp_month: 1, exp_year: 2031 } }],
    ['pm_stranger', { id: 'pm_stranger', customer: 'cus_other', card: { brand: 'amex', last4: '0005', exp_month: 2, exp_year: 2029 } }],
  ]);
  const intents = new Map<string, any>();
  const seenKeys = new Map<string, any>();
  let n = 0;
  const pay: Payments = {
    enabled: true,
    publishableKey: 'pk_test_fake',
    call: async (method, path, params: any = {}, key) => {
      if (key && seenKeys.has(key)) return seenKeys.get(key);
      let out: any;
      if (method === 'POST' && path === '/v1/customers') {
        out = { id: `cus_${++n}`, invoice_settings: {} };
        customers.set(out.id, out);
      } else if (method === 'GET' && path.startsWith('/v1/customers/')) out = customers.get(path.split('/')[3]);
      else if (method === 'POST' && path.startsWith('/v1/customers/')) {
        out = customers.get(path.split('/')[3]);
        out.invoice_settings.default_payment_method = params.invoice_settings.default_payment_method;
      } else if (method === 'POST' && path === '/v1/setup_intents') out = { id: `seti_${++n}`, client_secret: `seti_secret_${n}` };
      else if (method === 'GET' && path === '/v1/payment_methods') out = { data: [...methods.values()].filter((m) => m.customer === params.customer) };
      else if (method === 'GET' && path.startsWith('/v1/payment_methods/')) out = methods.get(path.split('/')[3]) ?? { customer: null };
      else if (method === 'POST' && path.endsWith('/detach')) {
        out = methods.get(path.split('/')[3]);
        out.customer = null;
      } else if (method === 'POST' && path === '/v1/payment_intents') {
        const threeDS = params.payment_method === 'pm_3ds';
        out = { id: `pi_${++n}`, amount: params.amount, status: threeDS ? 'requires_action' : 'succeeded', client_secret: `pi_secret_${n}`, metadata: params.metadata };
        if (!threeDS) out.amount_received = params.amount;
        intents.set(out.id, out);
      } else if (method === 'GET' && path.startsWith('/v1/payment_intents/')) out = intents.get(path.split('/')[3]);
      else throw new Error(`fake stripe: ${method} ${path}`);
      if (key) seenKeys.set(key, out);
      return out;
    },
  };
  // Simulate the browser finishing Stripe Elements: attach a card to the customer.
  const attach = (pm: string, customer: string) => (methods.get(pm).customer = customer);
  return { pay, attach, intents };
}

test('saved cards and paying invoices through Stripe (fake)', async () => {
  const stripe = fakeStripe();
  const { call, db, close } = await setup({ payments: stripe.pay });
  const harper = clientId(db, 'Linda Harper');
  const { session } = await signIn(call, harper);

  const setupRes = await call('POST', '/portal/cards/setup', undefined, session);
  assert.equal(setupRes.data.publishableKey, 'pk_test_fake');
  const customer = (db.prepare('SELECT stripe_customer_id FROM clients WHERE id = ?').get(harper) as { stripe_customer_id: string }).stripe_customer_id;
  stripe.attach('pm_visa', customer);
  const cards = (await call('GET', '/portal/cards', undefined, session)).data;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].last4, '4242');

  // Someone else's card can't be used or removed.
  assert.equal((await call('DELETE', '/portal/cards/pm_stranger', undefined, session)).status, 404);

  const invoice = db.prepare("SELECT id FROM invoices WHERE client_id = ? AND status = 'sent'").get(harper) as { id: number };
  assert.equal((await call('POST', `/portal/invoices/${invoice.id}/pay`, { paymentMethodId: 'pm_stranger' }, session)).status, 404);

  const paid = await call('POST', `/portal/invoices/${invoice.id}/pay`, { paymentMethodId: 'pm_visa' }, session);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.requiresAction, false);
  const after = (await call('GET', `/portal/invoices/${invoice.id}`, undefined, session)).data.invoice;
  assert.equal(after.status, 'paid');
  assert.equal(after.balance, 0);
  assert.equal((await call('POST', `/portal/invoices/${invoice.id}/pay`, { paymentMethodId: 'pm_visa' }, session)).status, 409, 'nothing left to pay');
  close();
});

test('bank approval (3-D Secure) is confirmed with Stripe and recorded exactly once', async () => {
  const stripe = fakeStripe();
  const { call, db, close } = await setup({ payments: stripe.pay });
  const harper = clientId(db, 'Linda Harper');
  const { session } = await signIn(call, harper);
  await call('POST', '/portal/cards/setup', undefined, session);
  const customer = (db.prepare('SELECT stripe_customer_id FROM clients WHERE id = ?').get(harper) as { stripe_customer_id: string }).stripe_customer_id;
  stripe.attach('pm_3ds', customer);
  const invoice = db.prepare("SELECT id FROM invoices WHERE client_id = ? AND status = 'sent'").get(harper) as { id: number };

  const res = await call('POST', `/portal/invoices/${invoice.id}/pay`, { paymentMethodId: 'pm_3ds' }, session);
  assert.equal(res.data.requiresAction, true);
  const pi = [...stripe.intents.values()].at(-1);
  assert.equal((await call('POST', `/portal/invoices/${invoice.id}/pay/confirm`, { paymentIntentId: pi.id }, session)).status, 402, 'not approved yet');

  pi.status = 'succeeded'; // the cardholder approved it in the browser
  pi.amount_received = pi.amount;
  await call('POST', `/portal/invoices/${invoice.id}/pay/confirm`, { paymentIntentId: pi.id }, session);
  await call('POST', `/portal/invoices/${invoice.id}/pay/confirm`, { paymentIntentId: pi.id }, session);
  const payments = db.prepare('SELECT COUNT(*) AS n FROM payments WHERE external_id = ?').get(pi.id) as { n: number };
  assert.equal(payments.n, 1);
  close();
});

test('office can charge a saved card; card payments are off without Stripe keys', async () => {
  const stripe = fakeStripe();
  const { call, db, close } = await setup({ payments: stripe.pay });
  const harper = clientId(db, 'Linda Harper');
  const { session } = await signIn(call, harper);
  await call('POST', '/portal/cards/setup', undefined, session);
  const customer = (db.prepare('SELECT stripe_customer_id FROM clients WHERE id = ?').get(harper) as { stripe_customer_id: string }).stripe_customer_id;
  stripe.attach('pm_visa', customer);
  const { data } = await call('GET', `/clients/${harper}/cards`);
  assert.equal(data.cards[0].id, 'pm_visa');
  const invoice = db.prepare("SELECT id FROM invoices WHERE client_id = ? AND status = 'sent'").get(harper) as { id: number };
  const charged = await call('POST', `/invoices/${invoice.id}/charge`, { paymentMethodId: 'pm_visa' });
  assert.equal(charged.data.status, 'paid');
  close();

  const off = await setup();
  const s2 = await signIn(off.call, clientId(off.db, 'Linda Harper'));
  assert.deepEqual((await off.call('GET', '/portal/cards', undefined, s2.session)).data, []);
  assert.equal((await off.call('POST', '/portal/cards/setup', undefined, s2.session)).status, 503);
  off.close();
});

test('approving takes a 25% deposit; paying it does not close the job; the final invoice credits it', async () => {
  const { call, db, jobId, close } = await setup();
  const wells = clientId(db, 'David & Karen Wells');
  const { session } = await signIn(call, wells);
  const heatPump = jobId('Heat pump replacement'); // $11,475 estimate
  const res = await call('POST', `/portal/estimates/${heatPump}/approve`, { signatureName: 'Karen Wells', signature: SIG }, session);
  assert.equal(res.data.deposit.amount, 2868.75);
  assert.equal(res.data.deposit.status, 'sent');
  assert.equal((await call('POST', `/portal/estimates/${heatPump}/approve`, { signatureName: 'Karen Wells', signature: SIG }, session)).status, 409, 'only once');

  const { data: estimate } = await call('GET', `/jobs/${heatPump}/estimate`);
  assert.equal(estimate.signature.name, 'Karen Wells');
  assert.equal(estimate.signature.total, 11475);

  await call('POST', `/invoices/${res.data.deposit.invoiceId}/payments`, { amount: 2868.75, method: 'Check' });
  assert.equal((await call('GET', `/jobs/${heatPump}`)).data.status, 'quoted', 'a deposit does not mark the job paid');

  const { data: final } = await call('POST', '/invoices', { jobId: heatPump });
  assert.ok(final.items.some((i: any) => i.description.startsWith('Less deposit paid') && i.unitPrice === -2868.75));
  assert.equal(final.total, 11475 - 2868.75);

  // A per-job override of 0% means no deposit.
  const estate = jobId('Estate cleanout — whole house');
  await call('PATCH', `/jobs/${estate}`, { depositPercent: 0 });
  const r2 = await call('POST', `/portal/estimates/${estate}/approve`, { signatureName: 'Karen Wells', signature: SIG }, session);
  assert.equal(r2.data.deposit, null);
  close();
});

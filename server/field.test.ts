import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setup } from './testutil.ts';
import { localDate } from './repo.ts';

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('clocking in on a scheduled job starts it; switching jobs closes the previous entry', async () => {
  const { call, userId, jobId, close } = await setup();
  const chris = userId('Chris Walker');
  const pm = jobId('Quarterly PM — 6 rooftop units');

  const a = await call('POST', '/time/clock-in', { userId: chris });
  assert.equal(a.data.entry.jobId, null);

  const b = await call('POST', '/time/clock-in', { userId: chris, jobId: pm });
  assert.equal(b.data.entry.jobId, pm);
  const { data: job } = await call('GET', `/jobs/${pm}`);
  assert.equal(job.status, 'in_progress', 'starting the timer moves a scheduled job to In Progress');

  const today = localDate();
  const { data: entries } = await call('GET', `/time?userId=${chris}&from=${today}&to=${today}`);
  assert.equal(entries.length, 2);
  assert.ok(entries[0].endedAt, 'general time closed when switching to the job');
  assert.equal(entries[1].endedAt, null);

  await call('POST', '/time/clock-out', { userId: chris });
  const { data: status } = await call('GET', `/time/status/${chris}`);
  assert.equal(status.entry, null);
  close();
});

test("daily log fills today's checklist from templates and tracks the report through review", async () => {
  const { call, userId, close } = await setup();
  const tony = userId('Tony Ruiz');
  const today = localDate();

  const { data: log } = await call('GET', `/daily/${tony}/${today}`);
  const titles = log.items.map((i: any) => i.title);
  assert.ok(titles.some((t: string) => t.startsWith('Pre-trip vehicle')), 'technician template applies');
  assert.ok(titles.includes('Log dump tickets and weights'), 'junk-removal template applies');
  assert.ok(!titles.includes('Follow up on unpaid invoices'), 'office template does not apply');
  assert.ok(log.timeEntries.length >= 1, 'seeded clock-in shows up');

  // Fetching again must not duplicate template items.
  const again = await call('GET', `/daily/${tony}/${today}`);
  assert.equal(again.data.items.length, log.items.length);

  await call('PATCH', `/daily-items/${log.items[0].id}`, { done: true });
  await call('POST', `/daily/${tony}/${today}/items`, { title: 'Pick up trailer', createdBy: userId('Alex Morgan') });

  const r = await call('PUT', `/daily/${tony}/${today}/report`, { summary: 'Done', issues: '', tomorrow: 'More', submit: true });
  assert.ok(r.data.submittedAt);
  const rev = await call('POST', `/daily/${tony}/${today}/review`, { reviewerId: userId('Alex Morgan') });
  assert.ok(rev.data.reviewedAt);

  const { data: team } = await call('GET', `/daily?date=${today}`);
  const row = team.find((t: any) => t.userId === tony);
  assert.equal(row.itemsDone, 1);
  assert.equal(row.itemsTotal, log.items.length + 1);
  assert.equal(row.submitted, true);
  assert.equal(row.reviewed, true);
  assert.equal(row.clockedIn, true);

  // Resubmitting clears the sign-off.
  const re = await call('PUT', `/daily/${tony}/${today}/report`, { summary: 'Edited', submit: true });
  assert.equal(re.data.reviewedAt, null);
  close();
});

test('job notes save photos to disk and serve them; deleting the note removes the files', async () => {
  const { call, origin, uploadDir, userId, jobId, close } = await setup();
  const job = jobId('Garage cleanout');
  const { status, data: note } = await call('POST', `/jobs/${job}/notes`, {
    authorId: userId('Tony Ruiz'),
    body: 'Before photo',
    photos: [{ dataUrl: PNG, caption: 'Garage' }],
  });
  assert.equal(status, 200);
  assert.equal(note.photos.length, 1);
  const img = await fetch(origin + note.photos[0].url);
  assert.equal(img.status, 200);

  const bad = await call('POST', `/jobs/${job}/notes`, { photos: [{ dataUrl: 'data:text/html;base64,PGgxPg==' }] });
  assert.equal(bad.status, 400);

  // Shows up in the author's daily log.
  const { data: log } = await call('GET', `/daily/${userId('Tony Ruiz')}/${localDate()}`);
  assert.ok(log.notes.some((n: any) => n.id === note.id));

  const file = join(uploadDir, note.photos[0].url.split('/').pop());
  assert.ok(existsSync(file));
  await call('DELETE', `/notes/${note.id}`);
  assert.ok(!existsSync(file));
  close();
});

test('invoice lifecycle: create from job → send → partial → full payment marks job paid', async () => {
  const { call, jobId, close } = await setup();
  const job = jobId('AC not cooling'); // completed, $504 of line items
  const { data: inv } = await call('POST', '/invoices', { jobId: job, taxRate: 10 });
  assert.equal(inv.status, 'draft');
  assert.equal(inv.items.length, 3);
  assert.equal(inv.subtotal, 504);
  assert.equal(inv.total, 554.4);

  const pub = await call('GET', `/public/invoices/${inv.publicToken}`);
  assert.equal(pub.status, 404, 'drafts are not visible to clients');

  const payDraft = await call('POST', `/invoices/${inv.id}/payments`, { amount: 10, method: 'Cash' });
  assert.equal(payDraft.status, 409);

  const sent = await call('POST', `/invoices/${inv.id}/send`);
  assert.equal(sent.data.status, 'sent');
  assert.equal((await call('GET', `/jobs/${job}`)).data.status, 'invoiced');
  assert.equal((await call('GET', `/public/invoices/${inv.publicToken}`)).status, 200);

  const partial = await call('POST', `/invoices/${inv.id}/payments`, { amount: 200, method: 'Check' });
  assert.equal(partial.data.status, 'sent');
  assert.equal(partial.data.balance, 354.4);

  const full = await call('POST', `/invoices/${inv.id}/payments`, { amount: 354.4, method: 'Card' });
  assert.equal(full.data.status, 'paid');
  assert.equal((await call('GET', `/jobs/${job}`)).data.status, 'paid');

  const edit = await call('PATCH', `/invoices/${inv.id}`, { taxRate: 0 });
  assert.equal(edit.status, 409, 'paid invoices are locked');

  // Removing a payment reopens it.
  const reopened = await call('DELETE', `/payments/${full.data.payments[1].id}`);
  assert.equal(reopened.data.status, 'sent');
  close();
});

test('seeded overdue invoice is flagged', async () => {
  const { call, close } = await setup();
  const { data } = await call('GET', '/invoices');
  assert.ok(data.some((i: any) => i.overdue));
  close();
});

test('company branding: defaults to the logo and colors, validates changes, and ships with bootstrap', async () => {
  const { call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  assert.equal(boot.company.brandColor, '#184478');
  assert.match(boot.company.logo, /^data:image\/png;base64,/);

  assert.equal((await call('PUT', '/settings/company', { brandColor: 'navy' })).status, 400);
  assert.equal((await call('PUT', '/settings/company', { logo: 'data:text/html;base64,PGgxPg==' })).status, 400);
  assert.equal((await call('PUT', '/settings/company', { logo: 'https://example.com/logo.png' })).status, 400);

  const saved = await call('PUT', '/settings/company', { brandColor: '#0a5c36', accentColor: '#f59e0b', logo: PNG });
  assert.equal(saved.status, 200);
  assert.equal((await call('GET', '/bootstrap')).data.company.brandColor, '#0a5c36');

  const removed = await call('PUT', '/settings/company', { logo: null });
  assert.equal(removed.data.logo, null);
  close();
});

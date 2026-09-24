import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';
import { runScheduledTexts } from './texting.ts';

const texts = (db: any, jobId?: number) =>
  db.prepare(`SELECT * FROM outbox WHERE channel = 'sms' ${jobId ? 'AND job_id = ?' : ''} ORDER BY id`).all(...(jobId ? [jobId] : [])) as any[];

/** A local-time Date `hours` from `base`. */
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * 3_600_000);
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test('office can text a booking confirmation; opted-out or phoneless clients are blocked', async () => {
  const { call, db, jobId, close } = await setup();
  const job = jobId('Hot tub removal');
  const preview = await call('GET', `/jobs/${job}/text/booking`);
  assert.match(preview.data.body, /you're booked with Big Country Cleanup & Restoration for Hot tub removal/);
  assert.equal(preview.data.blocked, null);

  assert.equal((await call('POST', `/jobs/${job}/text`, { kind: 'booking' })).status, 200);
  const [sms] = texts(db, job);
  assert.equal(sms.to_address, '+15553320198');
  assert.equal(sms.status, 'not_configured', 'waits in the outbox until Twilio is connected');

  // Quote-ready texts carry a sign-in link straight to their estimates.
  const quote = jobId('Estate cleanout — whole house');
  await call('POST', `/jobs/${quote}/text`, { kind: 'quote_ready' });
  assert.match(texts(db, quote)[0].link, /^\/portal\/login\?token=.+&next=%2Fportal%2Festimates$/);

  const client = (await call('GET', `/jobs/${job}`)).data.client;
  await call('PATCH', `/clients/${client.id}/texting`, { optOut: true });
  const blocked = await call('POST', `/jobs/${job}/text`, { kind: 'booking' });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /opted out/);

  const { data: noPhone } = await call('POST', '/clients', { name: 'No Phone', email: 'np@example.com' });
  const { data: j } = await call('POST', '/jobs', { divisionId: 1, clientId: noPhone.id, title: 'x' });
  assert.match((await call('POST', `/jobs/${j.id}/text`, { kind: 'request_received' })).data.error, /doesn't have a mobile number/);
  close();
});

test('24-hour reminders: sent once, only when booked ahead, re-armed when rescheduled, never overnight', async () => {
  const { call, db, jobId, close } = await setup();
  const job = jobId('Hot tub removal');
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  // Booked days ago for tomorrow at 11am.
  db.prepare('UPDATE jobs SET scheduled_start = ?, scheduled_end = ?, booked_at = ?, reminder_sent_at = NULL WHERE id = ?').run(
    iso(at(noon, 23)),
    iso(at(noon, 26)),
    at(noon, -72).toISOString(),
    job,
  );
  assert.deepEqual(runScheduledTexts(db, at(noon, -3)).filter((s) => s.includes('JNK-1007')), [], 'more than 24h out: not yet');
  assert.ok(runScheduledTexts(db, noon).includes('reminder JNK-1007'));
  assert.ok(!runScheduledTexts(db, at(noon, 1)).includes('reminder JNK-1007'), 'only once');
  assert.match(texts(db, job).at(-1).body, /^Reminder from Big Country/);

  // Rescheduling re-arms it; booking the new time today (less than a day ahead) skips the reminder.
  await call('PATCH', `/jobs/${job}`, { scheduledStart: iso(at(noon, 6)), scheduledEnd: iso(at(noon, 8)) }); // later today
  assert.equal((db.prepare('SELECT reminder_sent_at FROM jobs WHERE id = ?').get(job) as any).reminder_sent_at, null, 're-armed');
  db.prepare('UPDATE jobs SET booked_at = ? WHERE id = ?').run(noon.toISOString(), job); // as if rebooked at noon
  assert.ok(!runScheduledTexts(db, noon).includes('reminder JNK-1007'));
  assert.match((db.prepare('SELECT reminder_sent_at FROM jobs WHERE id = ?').get(job) as any).reminder_sent_at, /^skipped/);

  // Quiet hours: nothing goes out at 9pm.
  const nine = new Date(noon);
  nine.setHours(21);
  assert.deepEqual(runScheduledTexts(db, nine), []);
  close();
});

test('daily estimate follow-ups: one a day, stop after the limit or once approved', async () => {
  const { call, db, jobId, close } = await setup();
  await call('PUT', '/settings/company', { quoteFollowUpDays: 2, textReminders: false });
  const quote = jobId('Unit 4B mold remediation');
  const tenAm = new Date();
  tenAm.setHours(10, 30, 0, 0);
  const nextDay = (n: number) => at(tenAm, 24 * n);

  const nineAm = new Date(tenAm);
  nineAm.setHours(9);
  assert.ok(!runScheduledTexts(db, nineAm).includes('follow-up RST-1003'), 'follow-ups wait until 10am');
  assert.ok(runScheduledTexts(db, tenAm).includes('follow-up RST-1003'));
  assert.ok(!runScheduledTexts(db, at(tenAm, 2)).includes('follow-up RST-1003'), 'once a day');
  assert.ok(runScheduledTexts(db, nextDay(1)).includes('follow-up RST-1003'));
  assert.ok(!runScheduledTexts(db, nextDay(2)).includes('follow-up RST-1003'), 'stops at the limit');
  assert.equal(texts(db, quote).length, 2);
  assert.match(texts(db, quote)[0].body, /just checking in on your estimate for Unit 4B mold remediation \(\$3,185\)/);

  // Approval stops them: another quote, approved before its first follow-up.
  const estate = jobId('Estate cleanout — whole house');
  db.prepare("UPDATE jobs SET approved_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(estate);
  assert.ok(!runScheduledTexts(db, nextDay(3)).includes('follow-up JNK-1008'));
  close();
});

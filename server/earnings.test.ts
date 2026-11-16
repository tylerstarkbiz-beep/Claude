import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';
import { localDate } from './repo.ts';

const month = localDate().slice(0, 7);

test('each tech sees only their own tracker; pay managers see everyone', async () => {
  const { call, userId, close } = await setup();
  const tony = userId('Tony Ruiz');
  const dana = userId('Dana Cruz');
  const owner = userId('Alex Morgan');
  const office = userId('Jordan Lee');

  assert.equal((await call('GET', '/earnings')).status, 401, 'no acting user');

  const mine = await call('GET', '/earnings', undefined, undefined, tony);
  assert.equal(mine.status, 200);
  assert.equal(mine.data.userId, tony);
  assert.equal(mine.data.month, month);
  assert.ok(mine.data.totals.commission > 0 && mine.data.totals.tip > 0);
  assert.equal(mine.data.totals.total, Math.round((mine.data.totals.commission + mine.data.totals.tip) * 100) / 100);
  assert.equal(mine.data.history.length, 6);
  assert.ok(mine.data.lastMonth.total > 0, 'seeded history');
  assert.ok(mine.data.entries.every((e: { userId: number }) => e.userId === tony));

  assert.equal((await call('GET', `/earnings?userId=${dana}`, undefined, undefined, tony)).status, 403);
  assert.equal((await call('GET', `/earnings?userId=${dana}`, undefined, undefined, office)).status, 403, 'office staff without the permission');
  assert.equal((await call('GET', '/earnings/team', undefined, undefined, tony)).status, 403);

  const asOwner = await call('GET', `/earnings?userId=${dana}`, undefined, undefined, owner);
  assert.equal(asOwner.status, 200);
  assert.equal(asOwner.data.userId, dana);
  const team = await call('GET', '/earnings/team', undefined, undefined, owner);
  assert.equal(team.status, 200);
  assert.ok(team.data.some((r: { userId: number; total: number }) => r.userId === tony && r.total === mine.data.totals.total));
  close();
});

test('logging rules: commissions by pay managers, tips by the tech themselves', async () => {
  const { call, userId, jobId, close } = await setup();
  const tony = userId('Tony Ruiz');
  const dana = userId('Dana Cruz');
  const owner = userId('Alex Morgan');
  const job = jobId('Garage cleanout');

  assert.equal((await call('POST', '/earnings', { kind: 'commission', amount: 50, jobId: job }, undefined, tony)).status, 403);
  assert.equal((await call('POST', '/earnings', { kind: 'tip', amount: 20, userId: dana }, undefined, tony)).status, 403);
  assert.equal((await call('POST', '/earnings', { kind: 'tip', amount: 0 }, undefined, tony)).status, 400);

  const before = (await call('GET', '/earnings', undefined, undefined, tony)).data.totals;
  const tip = await call('POST', '/earnings', { kind: 'tip', amount: 20, jobId: job, note: 'Cash' }, undefined, tony);
  assert.equal(tip.status, 200);
  assert.equal(tip.data.userId, tony);
  assert.equal(tip.data.jobNumber?.length > 0, true);

  const comm = await call('POST', '/earnings', { kind: 'commission', amount: 33.5, userId: tony, jobId: job }, undefined, owner);
  assert.equal(comm.status, 200);
  const after = (await call('GET', '/earnings', undefined, undefined, tony)).data.totals;
  assert.equal(after.tip, before.tip + 20);
  assert.equal(after.commission, Math.round((before.commission + 33.5) * 100) / 100);

  // Techs can't change commissions, even their own; can edit their own tips.
  assert.equal((await call('PATCH', `/earnings/${comm.data.id}`, { amount: 500 }, undefined, tony)).status, 403);
  assert.equal((await call('PATCH', `/earnings/${tip.data.id}`, { kind: 'commission' }, undefined, tony)).status, 403);
  assert.equal((await call('PATCH', `/earnings/${tip.data.id}`, { amount: 25 }, undefined, tony)).data.amount, 25);
  assert.equal((await call('DELETE', `/earnings/${tip.data.id}`, undefined, undefined, dana)).status, 403);

  // A job's entries: the tech sees only theirs; the owner sees all.
  await call('POST', '/earnings', { kind: 'tip', amount: 10, userId: dana, jobId: job }, undefined, owner);
  const techView = (await call('GET', `/jobs/${job}/earnings`, undefined, undefined, tony)).data;
  assert.ok(techView.length === 2 && techView.every((e: { userId: number }) => e.userId === tony));
  assert.equal((await call('GET', `/jobs/${job}/earnings`, undefined, undefined, owner)).data.length, 3);

  // Commissions are a job cost; tips aren't.
  const costing = (await call('GET', `/jobs/${job}/costing`)).data;
  assert.equal(costing.commissions, 33.5);
  assert.equal(costing.totalCost, Math.round((costing.laborCost + costing.otherCosts + 33.5) * 100) / 100);
  close();
});

test('payouts clear the unpaid balance and lock entries for techs', async () => {
  const { call, userId, close } = await setup();
  const tony = userId('Tony Ruiz');
  const owner = userId('Alex Morgan');
  const start = (await call('GET', '/earnings', undefined, undefined, tony)).data;
  assert.equal(start.unpaid, start.totals.total, 'only this month is still owed');

  assert.equal((await call('POST', '/earnings/payout', { userId: tony, month }, undefined, tony)).status, 403);
  const paid = await call('POST', '/earnings/payout', { userId: tony, month }, undefined, owner);
  assert.equal(paid.status, 200);
  assert.equal(paid.data.unpaid, 0);
  assert.equal(paid.data.totals.total, start.totals.total, 'still counts as earned this month');

  const tip = paid.data.entries.find((e: { kind: string }) => e.kind === 'tip');
  assert.equal((await call('DELETE', `/earnings/${tip.id}`, undefined, undefined, tony)).status, 409);

  const undone = await call('POST', '/earnings/payout', { userId: tony, month, undo: true }, undefined, owner);
  assert.equal(undone.data.unpaid, start.unpaid);
  close();
});

test("bootstrap hides other people's pay rates", async () => {
  const { call, userId, close } = await setup();
  const tony = userId('Tony Ruiz');
  const dana = userId('Dana Cruz');
  const asTony = (await call('GET', '/bootstrap', undefined, undefined, tony)).data.users;
  const find = (users: { id: number; hourlyRate: number; commissionRate: number }[], uid: number) => users.find((u) => u.id === uid)!;
  assert.equal(find(asTony, tony).commissionRate, 8);
  assert.equal(find(asTony, tony).hourlyRate, 25);
  assert.equal(find(asTony, dana).commissionRate, 0);
  assert.equal(find(asTony, dana).hourlyRate, 0);

  const asOwner = (await call('GET', '/bootstrap', undefined, undefined, userId('Alex Morgan'))).data.users;
  assert.equal(find(asOwner, dana).commissionRate, 5);
  const asOffice = (await call('GET', '/bootstrap', undefined, undefined, userId('Jordan Lee'))).data.users;
  assert.equal(find(asOffice, dana).hourlyRate, 29, 'financial viewers keep hourly cost');
  assert.equal(find(asOffice, dana).commissionRate, 0);

  const patched = await call('PATCH', `/users/${dana}`, { commissionRate: 7.5 });
  assert.equal(patched.data.commissionRate, 7.5);
  assert.equal((await call('PATCH', `/users/${dana}`, { commissionRate: 120 })).status, 400);
  close();
});

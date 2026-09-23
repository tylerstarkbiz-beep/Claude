import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';
import { localDate } from './repo.ts';

test('labor cost uses the rate in effect when the time was worked', async () => {
  const { call, userId, jobId, close } = await setup();
  const kim = userId('Kim Nguyen');
  const job = jobId('Heat pump replacement');
  const before = (await call('GET', `/jobs/${job}/costing`)).data;

  await call('PATCH', `/users/${kim}`, { hourlyRate: 40 });
  await call('POST', '/time', { userId: kim, jobId: job, startedAt: '2026-01-05T08:00:00', endedAt: '2026-01-05T10:00:00' }); // 2h @ 40
  await call('PATCH', `/users/${kim}`, { hourlyRate: 50 }); // raise
  await call('POST', '/time', { userId: kim, jobId: job, startedAt: '2026-01-06T08:00:00', endedAt: '2026-01-06T09:30:00' }); // 1.5h @ 50

  const after = (await call('GET', `/jobs/${job}/costing`)).data;
  assert.equal(Math.round((after.laborCost - before.laborCost) * 100) / 100, 155);
  assert.equal(after.laborMinutes - before.laborMinutes, 210);
  close();
});

test('entered costs roll up into profit and margin', async () => {
  const { call, jobId, close } = await setup();
  const job = jobId('Hot tub removal'); // $650, no time or costs yet
  let c = (await call('GET', `/jobs/${job}/costing`)).data;
  assert.equal(c.revenue, 650);
  assert.equal(c.totalCost, 0);
  assert.equal(c.margin, 100);

  c = (await call('POST', `/jobs/${job}/costs`, { category: 'Equipment rental', description: 'Trailer', amount: 85 })).data;
  c = (await call('POST', `/jobs/${job}/costs`, { category: 'Dump / disposal fees', amount: 65 })).data;
  assert.equal(c.otherCosts, 150);
  assert.equal(c.profit, 500);
  assert.equal(c.margin, 76.9);

  c = (await call('PATCH', `/job-costs/${c.costs[0].id}`, { amount: 100 })).data;
  assert.equal(c.profit, 485);
  c = (await call('DELETE', `/job-costs/${c.costs[1].id}`)).data;
  assert.equal(c.otherCosts, 100);

  const bad = await call('POST', `/jobs/${job}/costs`, { amount: 'abc' });
  assert.equal(bad.status, 400);
  close();
});

test('every dashboard tile matches its click-through list, overall and per division', async () => {
  const { call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  for (const divisionId of [null, ...boot.divisions.map((d: any) => d.id)]) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    const { data } = await call('GET', `/dashboard${q}`);
    const list = async (kind: string) => (await call('GET', `/dashboard/list/${kind}${q}`)).data;
    assert.equal((await list('open_jobs')).length, data.totals.openJobs);
    assert.equal((await list('today')).length, data.totals.scheduledToday);
    assert.equal((await list('open_tasks')).length, data.totals.openTasks);
    const revenue = await list('revenue');
    const sum = Math.round(revenue.reduce((a: number, r: any) => a + r.revenue, 0) * 100) / 100;
    assert.equal(sum, data.totals.revenueMonth);
  }
  close();
});

test('revenue this month follows completion date, not last edit', async () => {
  const { call, db, jobId, close } = await setup();
  const monthRevenue = async () => (await call('GET', '/dashboard')).data.totals.revenueMonth;
  const oldJob = jobId('Mini-split tune-up');
  db.prepare("UPDATE jobs SET completed_at = '2020-01-15T10:00:00' WHERE id = ?").run(oldJob);
  const base = await monthRevenue();

  await call('PATCH', `/jobs/${oldJob}`, { description: 'edited' });
  assert.equal(await monthRevenue(), base, 'editing an old job does not move its revenue');

  const hot = jobId('Hot tub removal'); // $650 scheduled
  await call('PATCH', `/jobs/${hot}`, { status: 'completed' });
  assert.equal(await monthRevenue(), base + 650);
  const { data: job } = await call('GET', `/jobs/${hot}`);
  assert.equal(job.completedAt.slice(0, 10), localDate());

  await call('PATCH', `/jobs/${hot}`, { status: 'in_progress' });
  assert.equal(await monthRevenue(), base, 'reopening removes it');
  close();
});

test('team: rates and permissions validated; the last team manager cannot be removed', async () => {
  const { call, userId, close } = await setup();
  const alex = userId('Alex Morgan'); // the only member with manage_team
  assert.equal((await call('PATCH', `/users/${alex}`, { hourlyRate: -5 })).status, 400);
  assert.equal((await call('PATCH', `/users/${alex}`, { email: 'kim@example.com' })).status, 409);
  assert.equal((await call('PATCH', `/users/${alex}`, { permissions: ['view_financials'] })).status, 409);
  assert.equal((await call('PATCH', `/users/${alex}`, { active: false })).status, 409);

  const { data: kim } = await call('PATCH', `/users/${userId('Kim Nguyen')}`, { permissions: ['view_financials', 'bogus'], role: 'manager' });
  assert.deepEqual(kim.permissions, ['view_financials']);
  assert.equal(kim.role, 'manager');

  const { data: nu } = await call('POST', '/users', { name: 'New Tech', email: 'new@example.com', role: 'office', hourlyRate: 22 });
  assert.deepEqual(nu.permissions, ['view_financials', 'manage_invoices', 'manage_jobs'], 'role defaults applied');
  assert.equal(nu.hourlyRate, 22);
  close();
});

test('profitability report covers completed jobs and matches job costing', async () => {
  const { call, jobId, close } = await setup();
  const { data: rows } = await call('GET', '/reports/profitability');
  assert.ok(rows.length >= 5);
  assert.ok(rows.every((r: any) => r.completedAt));
  const ac = rows.find((r: any) => r.jobId === jobId('AC not cooling'));
  const { data: costing } = await call('GET', `/jobs/${ac.jobId}/costing`);
  assert.equal(ac.profit, costing.profit);
  assert.equal(ac.laborCost, costing.laborCost);

  const { data: wip } = await call('GET', '/reports/profitability?includeOpen=1');
  assert.ok(wip.length > rows.length, 'work in progress adds open jobs');
  close();
});

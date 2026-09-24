import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';

test('bootstrap returns the four divisions with custom fields', async () => {
  const { call, close } = await setup();
  const { data } = await call('GET', '/bootstrap');
  assert.deepEqual(
    data.divisions.map((d: any) => d.name),
    ['Restoration', 'Junk Removal', 'Janitorial', 'HVAC'],
  );
  assert.ok(data.divisions[0].fields.some((f: any) => f.key === 'claimNumber'));
  close();
});

test('creating a restoration job fires the adjuster automation', async () => {
  const { call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  const restoration = boot.divisions.find((d: any) => d.slug === 'restoration');
  const { data: clients } = await call('GET', '/clients');
  const { status, data: job } = await call('POST', '/jobs', {
    divisionId: restoration.id,
    clientId: clients[0].id,
    title: 'Test water loss',
    assigneeId: boot.users[0].id,
    lineItems: [{ description: 'Extraction', quantity: 100, unitPrice: 2 }],
  });
  assert.equal(status, 200);
  assert.match(job.number, /^RST-/);
  assert.equal(job.total, 200);

  const { data: detail } = await call('GET', `/jobs/${job.id}`);
  const task = detail.tasks.find((t: any) => t.title.startsWith('Contact adjuster'));
  assert.ok(task, 'automation should create a linked task');
  assert.equal(task.assigneeId, boot.users[0].id, 'job_assignee should be copied');
  close();
});

test('completing an HVAC job creates a maintenance-plan follow-up', async () => {
  const { call, close } = await setup();
  const { data: jobs } = await call('GET', '/jobs?status=in_progress');
  const hvacJob = jobs.find((j: any) => j.number.startsWith('HVC'));
  await call('PATCH', `/jobs/${hvacJob.id}`, { status: 'completed' });
  const { data: detail } = await call('GET', `/jobs/${hvacJob.id}`);
  assert.equal(detail.status, 'completed');
  assert.ok(detail.tasks.some((t: any) => t.title.startsWith('Offer maintenance plan')));
  close();
});

test('task status changes track completion and validate input', async () => {
  const { call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  const { data: board } = await call('GET', `/boards/${boot.boards[0].id}`);
  const task = board.tasks.find((t: any) => t.status !== 'done' && !t.parentId);

  const { data: done } = await call('PATCH', `/tasks/${task.id}`, { status: 'done' });
  assert.equal(done.status, 'done');
  assert.ok(done.completedAt);

  const bad = await call('PATCH', `/tasks/${task.id}`, { status: 'bogus' });
  assert.equal(bad.status, 400);
  close();
});

test('subtasks inherit their parent group and move with it', async () => {
  const { call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  const { data: board } = await call('GET', `/boards/${boot.boards[0].id}`);
  const parent = board.tasks.find((t: any) => !t.parentId);
  const { data: sub } = await call('POST', '/tasks', { boardId: board.id, parentId: parent.id, title: 'Sub' });
  assert.equal(sub.groupId, parent.groupId);

  const other = board.groups.find((g: any) => g.id !== parent.groupId);
  await call('PATCH', `/tasks/${parent.id}`, { groupId: other.id });
  const { data: moved } = await call('GET', `/tasks/${sub.id}`);
  assert.equal(moved.groupId, other.id);
  close();
});

test('a broken automation does not block the job update', async () => {
  const { db, call, close } = await setup();
  const { data: boot } = await call('GET', '/bootstrap');
  const junk = boot.divisions.find((d: any) => d.slug === 'junk-removal');
  await call('POST', '/automations', {
    name: 'Broken',
    trigger: { type: 'job_status_changed', toStatus: 'completed', divisionId: junk.id },
    action: { type: 'create_task', boardId: 99999, title: 'x' },
  });
  const { data: jobs } = await call('GET', `/jobs?divisionId=${junk.id}&status=scheduled`);
  const res = await call('PATCH', `/jobs/${jobs[0].id}`, { status: 'completed' });
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'completed');
  const err = db.prepare("SELECT * FROM activity WHERE kind = 'automation_error'").get();
  assert.ok(err);
  close();
});

test('rescheduling a job keeps end after start and can reassign the tech', async () => {
  const { call, close } = await setup();
  const { data: jobs } = await call('GET', '/jobs?status=scheduled');
  const job = jobs[0];
  const { data: boot } = await call('GET', '/bootstrap');
  const tech = boot.users.find((u: any) => u.id !== job.assigneeId);

  const moved = await call('PATCH', `/jobs/${job.id}`, { scheduledStart: '2026-10-01T10:30', scheduledEnd: '2026-10-01T12:45', assigneeId: tech.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.scheduledStart, '2026-10-01T10:30');
  assert.equal(moved.data.assigneeId, tech.id);

  const backwards = await call('PATCH', `/jobs/${job.id}`, { scheduledEnd: '2026-10-01T09:00' });
  assert.equal(backwards.status, 400);
  close();
});

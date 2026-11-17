import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './testutil.ts';
import { DEMO_PASSWORD } from './seed.ts';

test('staff sign in with email and password; office API needs a session', async () => {
  const { origin, call, userId, close } = await setup();
  const raw = async (method: string, path: string, body?: unknown, session?: string) => {
    const res = await fetch(origin + '/api' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { 'x-staff-session': session } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };

  // Locked without signing in; customer-facing routes stay open.
  assert.equal((await raw('GET', '/bootstrap')).status, 401);
  assert.equal((await raw('GET', '/jobs')).status, 401);
  assert.equal((await raw('GET', '/bootstrap', undefined, 'not-a-real-token')).status, 401);
  assert.equal((await raw('GET', '/public/branding')).status, 200);
  assert.equal((await raw('GET', '/portal/me')).status, 401, 'portal uses its own sign-in');

  assert.equal((await raw('POST', '/auth/login', { email: 'admin@example.com', password: 'wrong-password' })).status, 401);
  const login = await raw('POST', '/auth/login', { email: ' Admin@Example.com ', password: DEMO_PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.name, 'Office Admin');
  assert.equal(login.data.user.password_hash, undefined, 'hash never leaves the server');
  assert.ok(login.data.user.permissions.includes('manage_pay') && login.data.user.permissions.includes('manage_team'), 'full access');
  const session = login.data.session as string;

  const boot = await raw('GET', '/bootstrap', undefined, session);
  assert.equal(boot.status, 200);
  assert.equal(boot.data.me.name, 'Office Admin');
  assert.equal((await raw('GET', '/earnings/team', undefined, session)).status, 200);

  await raw('POST', '/auth/logout', undefined, session);
  assert.equal((await raw('GET', '/bootstrap', undefined, session)).status, 401, 'signed out');

  // Admin sets a tech's password; old sessions for that tech end.
  const tony = userId('Tony Ruiz');
  assert.equal((await call('PATCH', `/users/${tony}`, { password: 'short' })).status, 400);
  assert.equal((await call('PATCH', `/users/${tony}`, { password: 'tony-new-pass' }, undefined, tony)).status, 403, 'techs cannot manage the team');
  assert.equal((await call('PATCH', `/users/${tony}`, { password: 'tony-new-pass' })).status, 200);
  assert.equal((await raw('POST', '/auth/login', { email: 'tony@example.com', password: DEMO_PASSWORD })).status, 401);
  const tonyLogin = await raw('POST', '/auth/login', { email: 'tony@example.com', password: 'tony-new-pass' });
  assert.equal(tonyLogin.status, 200);
  assert.equal((await raw('GET', '/earnings/team', undefined, tonyLogin.data.session)).status, 403);

  // Deactivated members can't sign in.
  await call('PATCH', `/users/${tony}`, { active: false });
  assert.equal((await raw('GET', '/bootstrap', undefined, tonyLogin.data.session)).status, 401);
  assert.equal((await raw('POST', '/auth/login', { email: 'tony@example.com', password: 'tony-new-pass' })).status, 401);
  close();
});

test('repeated wrong passwords lock the account for a while', async () => {
  const { origin, close } = await setup();
  const login = (password: string) =>
    fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dana@example.com', password }) });
  for (let i = 0; i < 8; i++) assert.equal((await login('nope-nope')).status, 401);
  assert.equal((await login(DEMO_PASSWORD)).status, 429, 'locked even with the right password');
  close();
});

test('signed-in user changes their own password', async () => {
  const { call, userId, close } = await setup();
  const dana = userId('Dana Cruz');
  assert.equal((await call('POST', '/auth/password', { current: 'wrong', next: 'whatever123' }, undefined, dana)).status, 400);
  assert.equal((await call('POST', '/auth/password', { current: DEMO_PASSWORD, next: 'dana-pass-2' }, undefined, dana)).status, 200);
  close();
});

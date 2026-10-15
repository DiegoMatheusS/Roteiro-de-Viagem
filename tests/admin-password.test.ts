import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/app';
import { openDatabase } from '../server/db';

const origin = 'https://roteirodeviagem.pages.dev';
const firstPassword = 'Initial-password-for-test-123';
const nextPassword = 'New-password-for-test-987';

test('painel admin troca senha com confirmacao, hash seguro e encerra todas as sessoes', async () => {
  const original = { NODE_ENV: process.env.NODE_ENV, PUBLIC_ADMIN_URL: process.env.PUBLIC_ADMIN_URL };
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ADMIN_URL = origin;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-change-password-'));
  const db = openDatabase(':memory:');
  const app = createApi({ db, photoDirectory: folder });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const req = (route: string, options: { cookie?: string; origin?: string; body?: unknown; method?: string } = {}) =>
    fetch(base + '/api' + route, {
      method: options.method || 'GET',
      headers: {
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  const cookie = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];
  try {
    const create = await req('/auth/register', { method: 'POST', origin, body: {
      displayName: 'Administrador de teste', email: 'change-admin@example.com', password: firstPassword,
    } });
    assert.equal(create.status, 201, await create.text());
    const normalSession = cookie(create);

    const body = { currentPassword: firstPassword, newPassword: nextPassword, confirmPassword: nextPassword };
    assert.equal((await req('/admin/change-password', { method: 'POST', origin, cookie: normalSession, body })).status, 403);
    assert.equal((await req('/admin/change-password', { method: 'POST', origin, body })).status, 401);
    db.prepare('UPDATE users SET role=? WHERE email=?').run('admin', 'change-admin@example.com');

    const currentLogin = await req('/auth/login', { method: 'POST', origin, body: {
      email: 'change-admin@example.com', password: firstPassword,
    } });
    assert.equal(currentLogin.status, 200);
    const sessionA = cookie(currentLogin);
    const secondLogin = await req('/auth/login', { method: 'POST', origin, body: {
      email: 'change-admin@example.com', password: firstPassword,
    } });
    assert.equal(secondLogin.status, 200);
    const sessionB = cookie(secondLogin);
    const previousHash = (db.prepare('SELECT password_hash FROM users WHERE email=?').get('change-admin@example.com') as any).password_hash;

    const invalidCalls = [
      { ...body, currentPassword: 'incorrect-password' },
      { ...body, confirmPassword: 'different-password' },
      { ...body, newPassword: 'short', confirmPassword: 'short' },
      { ...body, newPassword: firstPassword, confirmPassword: firstPassword },
    ];
    const invalidStatuses = [401, 400, 400, 400];
    for (let i = 0; i < invalidCalls.length; i++) {
      const answer = await req('/admin/change-password', { method: 'POST', origin, cookie: sessionA, body: invalidCalls[i] });
      assert.equal(answer.status, invalidStatuses[i]);
    }
    assert.equal((db.prepare('SELECT password_hash FROM users WHERE email=?').get('change-admin@example.com') as any).password_hash, previousHash);

    const blockedOrigin = await req('/admin/change-password', { method: 'POST', origin: 'https://other.example.com', cookie: sessionA, body });
    assert.equal(blockedOrigin.status, 403);

    const success = await req('/admin/change-password', { method: 'POST', origin, cookie: sessionA, body });
    assert.equal(success.status, 200, await success.clone().text());
    assert.match(success.headers.get('set-cookie') || '', /Max-Age=0|Expires=/i);
    assert.equal((await success.json()).ok, true);
    const changedHash = (db.prepare('SELECT password_hash FROM users WHERE email=?').get('change-admin@example.com') as any).password_hash;
    assert.notEqual(changedHash, previousHash);
    assert.ok(!changedHash.includes(nextPassword));
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as any).count, 0);
    assert.equal((await req('/admin/summary', { cookie: sessionA })).status, 401);
    assert.equal((await req('/admin/summary', { cookie: sessionB })).status, 401);
    assert.equal((await req('/auth/login', { method: 'POST', origin, body: {
      email: 'change-admin@example.com', password: firstPassword,
    } })).status, 401);
    const freshLogin = await req('/auth/login', { method: 'POST', origin, body: {
      email: 'change-admin@example.com', password: nextPassword,
    } });
    assert.equal(freshLogin.status, 200);
    assert.equal((await req('/admin/summary', { cookie: cookie(freshLogin) })).status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
    fs.rmSync(folder, { recursive: true, force: true });
    for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

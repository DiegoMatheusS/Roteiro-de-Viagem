import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/app';
import { openDatabase } from '../server/db';

const origin = 'https://roteirodeviagem.pages.dev';
const password = 'Unique-test-password-123';
test('admin troca e-mail apenas com senha, confirmacao e e-mail nao cadastrado; encerra as sessoes', async () => {
  const original = { NODE_ENV: process.env.NODE_ENV, PUBLIC_ADMIN_URL: process.env.PUBLIC_ADMIN_URL };
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ADMIN_URL = origin;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-admin-email-'));
  const db = openDatabase(':memory:');
  const server = createApi({ db, photoDirectory: directory }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = (route: string, options: { cookie?: string; origin?: string; body?: unknown; method?: string } = {}) =>
    fetch(base + '/api' + route, {
      method: options.method || 'GET',
      headers: {
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.origin ? { Origin: options.origin } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  const session = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];
  try {
    const signup = await call('/auth/register', { method: 'POST', origin,
      body: { email: 'admin-old@example.invalid', displayName: 'Admin', password } });
    assert.equal(signup.status, 201);
    const ordinaryCookie = session(signup);
    assert.equal((await call('/admin/account', { cookie: ordinaryCookie })).status, 403);
    assert.equal((await call('/admin/change-email', { method: 'POST', origin, cookie: ordinaryCookie,
      body: { newEmail: 'admin-new@example.invalid', confirmEmail: 'admin-new@example.invalid', currentPassword: password } })).status, 403);

    const other = await call('/auth/register', { method: 'POST', origin,
      body: { email: 'already@example.invalid', displayName: 'Outro', password } });
    assert.equal(other.status, 201);
    db.prepare("UPDATE users SET role='admin' WHERE email=?").run('admin-old@example.invalid');
    const login = async (email: string, pass = password) => call('/auth/login', { method: 'POST', origin,
      body: { email, password: pass } });
    const firstLogin = await login('admin-old@example.invalid');
    assert.equal(firstLogin.status, 200);
    const cookieA = session(firstLogin);
    const secondLogin = await login('admin-old@example.invalid');
    assert.equal(secondLogin.status, 200);
    const cookieB = session(secondLogin);
    const getAccount = await call('/admin/account', { cookie: cookieA });
    assert.equal(getAccount.status, 200);
    assert.deepEqual(await getAccount.json(), { email: 'admin-old@example.invalid' });
    const validBody = {
      newEmail: ' ADMIN-NEW@example.invalid ', confirmEmail: 'admin-new@example.invalid', currentPassword: password,
    };
    const invalid = [
      [{ ...validBody, currentPassword: 'wrong-password' }, 401],
      [{ ...validBody, confirmEmail: 'wrong@example.invalid' }, 400],
      [{ ...validBody, newEmail: 'not-an-email', confirmEmail: 'not-an-email' }, 400],
      [{ ...validBody, newEmail: 'admin-old@example.invalid', confirmEmail: 'admin-old@example.invalid' }, 400],
      [{ ...validBody, newEmail: 'already@example.invalid', confirmEmail: 'already@example.invalid' }, 409],
    ] as const;
    for (const [body, status] of invalid) {
      const result = await call('/admin/change-email', { method: 'POST', origin, cookie: cookieA, body });
      assert.equal(result.status, status);
    }
    assert.equal((await call('/admin/change-email', { method: 'POST', origin: 'https://external.example.invalid',
      cookie: cookieA, body: validBody })).status, 403);
    assert.equal((await call('/admin/change-email', { method: 'POST', origin, body: validBody })).status, 401);
    const success = await call('/admin/change-email', { method: 'POST', origin, cookie: cookieA, body: validBody });
    assert.equal(success.status, 200, await success.clone().text());
    assert.equal((await success.json()).ok, true);
    assert.match(success.headers.get('set-cookie') || '', /Max-Age=0|Expires=/);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id=(SELECT id FROM users WHERE email=?)')
      .get('admin-new@example.invalid') as any).count, 0);
    assert.equal((await call('/admin/summary', { cookie: cookieA })).status, 401);
    assert.equal((await call('/admin/summary', { cookie: cookieB })).status, 401);
    assert.equal((await login('admin-old@example.invalid')).status, 401);
    const updatedLogin = await login('admin-new@example.invalid');
    assert.equal(updatedLogin.status, 200);
    assert.equal((await call('/admin/account', { cookie: session(updatedLogin) })).status, 200);
    assert.equal((db.prepare('SELECT role FROM users WHERE email=?').get('admin-new@example.invalid') as any).role, 'admin');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

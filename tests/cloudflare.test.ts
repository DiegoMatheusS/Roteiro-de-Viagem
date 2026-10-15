import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import worker from '../public/_worker.js';
import { createApi } from '../server/app';
import { openDatabase } from '../server/db';
import { clientIp } from '../server/http';

const front = 'https://roteiro-teste.pages.dev';
const origin = 'https://roteiro-api-production.up.railway.app';
const secret = 'fixture-only-cloudflare-proxy-key-123456789';

test('Cloudflare serves assets without exposing the proxy and validates its configuration', async () => {
  const assets = { fetch: async () => new Response('<h1>Roteiro</h1>', { headers: { 'Content-Type': 'text/html' } }) };
  const page = await worker.fetch(new Request(front + '/'), { ASSETS: assets });
  assert.equal(page.headers.get('content-type'), 'text/html');
  for (const blocked of ['/admin', '/admin/', '/admin/users', '/api/admin', '/api/admin/summary', '/API/ADMIN/summary']) {
    const response = await worker.fetch(new Request(front + blocked), { ASSETS: assets });
    assert.equal(response.status, 404, blocked);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const backend of ['http://example.com', 'https://example.com/api', 'https://user:pass@example.com', 'https://example.com/?secret=x', front]) {
    const response = await worker.fetch(new Request(front + '/api/health'), { RDV_BACKEND_ORIGIN: backend, WEB_PROXY_SECRET: secret });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await worker.fetch(new Request(front + '/api/health'), {})).status, 503);
});

test('Cloudflare proxy preserves real account sessions, moderation permissions, uploads and client limits', async t => {
  const old = { NODE_ENV: process.env.NODE_ENV, PUBLIC_APP_URL: process.env.PUBLIC_APP_URL, WEB_PROXY_SECRET: process.env.WEB_PROXY_SECRET };
  Object.assign(process.env, { NODE_ENV: 'production', PUBLIC_APP_URL: front, WEB_PROXY_SECRET: secret });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-cloudflare-'));
  const db = openDatabase(':memory:');
  const app = express();
  app.post('/api/upload-probe', express.raw({ type: 'application/octet-stream' }), (req, res) => res.type('application/octet-stream').send(req.body));
  app.use(createApi({ db, photoDirectory: directory }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const local = `http://127.0.0.1:${(server.address() as any).port}`;
  const originalFetch = globalThis.fetch;
  let forwards = 0;
  globalThis.fetch = async (input: any, init?: any) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, origin);
    assert.equal(request.redirect, 'manual');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.headers.get('x-rdv-proxy-key'), secret);
    forwards++;
    return originalFetch(new Request(local + url.pathname + url.search, request));
  };
  const env = { RDV_BACKEND_ORIGIN: origin, WEB_PROXY_SECRET: secret };
  let cookie = '';
  const call = async (route: string, body?: any, ip = '2001:db8::1') => worker.fetch(new Request(front + '/api' + route, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: front, 'CF-Connecting-IP': ip, 'X-Rdv-Client-Ip': '1.2.3.4', 'X-Rdv-Proxy-Key': 'forged-client-value', Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
  try {
    await t.test('only the authenticated proxy can supply a client address', () => {
      const request = (key: string, address: string) => ({ get: (name: string) => new Headers({ 'X-Rdv-Proxy-Key': key, 'X-Rdv-Client-Ip': address }).get(name), ip: '127.0.0.1', socket: {} }) as any;
      assert.equal(clientIp(request(secret, '2001:db8::1')), '2001:db8::1');
      assert.equal(clientIp(request('forged', '1.2.3.4')), '127.0.0.1');
      assert.equal(clientIp(request(secret, '1.2.3.4, 5.6.7.8')), '127.0.0.1');
      process.env.WEB_PROXY_SECRET = '';
      assert.equal(clientIp(request(secret, '1.2.3.4')), '127.0.0.1');
      process.env.WEB_PROXY_SECRET = secret;
    });
    await t.test('cross-site writes stop before reaching the backend', async () => {
      const before = forwards;
      for (const requestOrigin of ['https://other.example', 'null', '']) {
        const response = await worker.fetch(new Request(front + '/api/auth/register', { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: '{}' }), env);
        assert.equal(response.status, 403);
      }
      assert.equal(forwards, before);
    });
    await t.test('secure login cookies work across the proxy and admin APIs still enforce roles', async () => {
      assert.equal((await call('/admin/summary')).status, 404);
      const registered = await call('/auth/register', { email: 'owner@example.invalid', displayName: 'Proprietário', password: 'fixture-password-123', role: 'admin' });
      assert.equal(registered.status, 201);
      const session = registered.headers.get('set-cookie')!;
      assert.match(session, /HttpOnly/i); assert.match(session, /Secure/i); assert.match(session, /SameSite=Strict/i); assert.match(session, /Path=\/api/i);
      assert.doesNotMatch(session, /Domain=/i);
      assert.equal(registered.headers.get('cache-control'), 'no-store');
      cookie = session.split(';')[0];
      assert.equal((await (await call('/auth/me')).json()).user.role, 'user');
      assert.equal((await call('/admin/summary')).status, 404);
      assert.equal((await (await call('/public-config')).json()).appOrigin, front);
    });
    await t.test('binary bodies and responses retain their content', async () => {
      const bytes = new Uint8Array([0, 1, 2, 127, 255, 0, 54]);
      const response = await worker.fetch(new Request(front + '/api/upload-probe?photo=1', { method: 'POST', headers: { Origin: front, Cookie: cookie, 'CF-Connecting-IP': '2001:db8::1', 'Content-Type': 'application/octet-stream' }, body: bytes }), env);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /application\/octet-stream/);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    });
    await t.test('registration limits follow the real visitor and ignore forged visitor headers', async () => {
      for (let i = 0; i < 4; i++) assert.equal((await call('/auth/register', { email: `test${i}@example.invalid`, displayName: 'Teste', password: 'fixture-password-123' })).status, 201);
      assert.equal((await call('/auth/register', { email: 'limited@example.invalid', displayName: 'Teste', password: 'fixture-password-123' })).status, 429);
      assert.equal((await call('/auth/register', { email: 'other@example.invalid', displayName: 'Teste', password: 'fixture-password-123' }, '2001:db8::2')).status, 201);
    });
    await t.test('logout revokes the proxied session', async () => {
      assert.equal((await call('/auth/logout', {})).status, 200);
      assert.equal((await (await call('/auth/me')).json()).user, null);
    });
    await t.test('network failures do not reveal upstream errors or secrets', async () => {
      globalThis.fetch = async () => { throw new Error(secret); };
      const response = await call('/health');
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes(secret));
    });
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close(); fs.rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(old)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

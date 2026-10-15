import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

// Exercise the real authentication API without contacting Google or using real user data.
test('verified Google login links an existing traveler account without duplicating data', async () => {
  const oldClient = process.env.GOOGLE_CLIENT_ID;
  const priorFetch = globalThis.fetch;
  const clientId = 'integration-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_ID = clientId;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  globalThis.fetch = ((input: any, init?: any) => String(input).includes('www.googleapis.com/oauth2/v3/certs')
    ? Promise.resolve(Response.json({ keys: [{ ...jwk, kid: 'test-link-key', kty: 'RSA', alg: 'RS256', use: 'sig' }] }))
    : priorFetch(input, init)) as typeof fetch;

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-google-link-'));
  const db = openDatabase(':memory:');
  const app = createApi({ db, photoDirectory: directory });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const apiUrl = 'http://127.0.0.1:' + (server.address() as any).port + '/api';
  const request = async (route: string, body: unknown) => {
    const response = await globalThis.fetch(apiUrl + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() as any };
  };
  const credential = (email: string, sub: string, hd?: string) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-link-key' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://accounts.google.com', aud: clientId, sub, email, email_verified: true,
      name: 'Viajante do teste', iat: now, exp: now + 3600, ...(hd ? { hd } : {})
    })).toString('base64url');
    const signed = header + '.' + payload;
    return signed + '.' + sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url');
  };
  const register = async (email: string) => request('/auth/register', {
    displayName: 'Viajante original', email, password: 'Original-password-12345'
  });
  try {
    const created = await register('traveler@gmail.com');
    assert.equal(created.status, 201);
    const existingId = created.body.user.id;
    const existingHash = (db.prepare('SELECT password_hash FROM users WHERE id=?').get(existingId) as any).password_hash;
    const googleToken = credential('traveler@gmail.com', 'google-sub-1');
    const linked = await request('/auth/google', { credential: googleToken });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.equal(linked.body.user.id, existingId);
    const stored = db.prepare('SELECT google_sub,password_hash,display_name FROM users WHERE id=?').get(existingId) as any;
    assert.equal(stored.google_sub, 'google-sub-1');
    assert.equal(stored.password_hash, existingHash);
    assert.equal(stored.display_name, 'Viajante original');
    assert.equal((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count, 1);
    assert.equal((await request('/auth/login', { email: 'traveler@gmail.com', password: 'Original-password-12345' })).status, 200);
    assert.equal((await request('/auth/google', { credential: googleToken })).body.user.id, existingId);
    const anotherGoogleIdentity = await request('/auth/google', { credential: credential('traveler@gmail.com', 'hijacker-sub-2') });
    assert.equal(anotherGoogleIdentity.status, 403);

    const external = await register('traveler@external.example');
    assert.equal(external.status, 201);
    const extId = external.body.user.id;
    const token = credential('traveler@external.example', 'external-google-sub');
    const challenge = await request('/auth/google', { credential: token });
    assert.equal(challenge.status, 409);
    assert.equal(challenge.body.code, 'GOOGLE_LINK_PASSWORD_REQUIRED');
    assert.equal((db.prepare('SELECT google_sub FROM users WHERE id=?').get(extId) as any).google_sub, null);
    const incorrect = await request('/auth/google', { credential: token, password: 'incorrect' });
    assert.equal(incorrect.status, 401);
    const confirmed = await request('/auth/google', { credential: token, password: 'Original-password-12345' });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.user.id, extId);
    assert.equal((await request('/auth/google', { credential: token })).status, 200);
    const externalHosted = await register('person@empresa.com.br');
    assert.equal(externalHosted.status, 201);
    assert.equal((await request('/auth/google', { credential: credential('person@empresa.com.br', 'workspace-sub', 'empresa.com.br') })).status, 200);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count, 3);

    db.prepare('UPDATE users SET role=? WHERE email=?').run('admin', 'traveler@gmail.com');
    const adminBlocked = await request('/auth/google', { credential: googleToken });
    assert.equal(adminBlocked.status, 403);
    assert.equal((await request('/auth/login', { email: 'traveler@gmail.com', password: 'Original-password-12345' })).status, 200);
    const brandNew = await request('/auth/google', { credential: credential('newgmail@gmail.com', 'fresh-sub') });
    assert.equal(brandNew.status, 200);
    assert.equal(brandNew.body.user.role, 'user');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
    globalThis.fetch = priorFetch;
    if (oldClient === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = oldClient;
  }
});

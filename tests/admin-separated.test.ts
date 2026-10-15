import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/app';
import { openDatabase } from '../server/db';

test('dois sites HTTPS independentes usam a mesma API e as edicoes do admin aparecem no app', async () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    PUBLIC_ADMIN_URL: process.env.PUBLIC_ADMIN_URL,
  };
  const appOrigin = 'https://roteirodeviagem.pages.dev';
  const adminOrigin = 'https://adminroteirodeviagem.pages.dev';
  Object.assign(process.env, { NODE_ENV: 'production', PUBLIC_APP_URL: appOrigin, PUBLIC_ADMIN_URL: adminOrigin });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-admin-separate-'));
  const db = openDatabase(':memory:');
  const app = createApi({ db, photoDirectory: folder });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  try {
    const call = async (route: string, options: { origin?: string; cookie?: string; method?: string; body?: unknown } = {}) =>
      fetch(base + '/api' + route, {
        method: options.method || 'GET',
        headers: {
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    const register = await call('/auth/register', {
      origin: appOrigin, method: 'POST',
      body: { email: 'responsavel@example.invalid', displayName: 'Responsável', password: 'senha-segura-para-teste-123' },
    });
    assert.equal(register.status, 201);
    assert.equal((await register.json()).user.role, 'user');
    const ordinaryCookie = register.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await call('/admin/summary', { cookie: ordinaryCookie })).status, 403);

    db.prepare('UPDATE users SET role=? WHERE email=?').run('admin', 'responsavel@example.invalid');
    const login = await call('/auth/login', {
      origin: adminOrigin, method: 'POST',
      body: { email: 'responsavel@example.invalid', password: 'senha-segura-para-teste-123' },
    });
    assert.equal(login.status, 200);
    const adminCookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await call('/admin/summary', { cookie: adminCookie })).status, 200);

    db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,active,managed)
      VALUES(?,?,?,?,?,?,?,?,1,1)`).run('node:13579', 'Restaurante Original', -23.56, -46.66,
      'Rua Exemplo 100', 'https://www.openstreetmap.org/node/13579', new Date().toISOString(), 'restaurant');

    const updated = await call('/admin/places/node%3A13579', {
      origin: adminOrigin, cookie: adminCookie, method: 'PATCH',
      body: { name: 'Restaurante Publicado', address: 'Rua Exemplo 100',
        description: 'Local para parada de viajantes', phone: '', website: '',
        openingHours: '', hoursVerified: false, active: true },
    });
    assert.equal(updated.status, 200, await updated.text());
    const fromApp = await call('/stations/node%3A13579');
    assert.equal(fromApp.status, 200);
    assert.equal((await fromApp.json()).name, 'Restaurante Publicado');

    assert.equal((await call('/admin/summary', { origin: 'https://desconhecido.example', method: 'POST', cookie: adminCookie, body: {} })).status, 403);
    delete process.env.PUBLIC_ADMIN_URL;
    assert.equal((await call('/auth/login', {
      origin: adminOrigin, method: 'POST',
      body: { email: 'responsavel@example.invalid', password: 'senha-segura-para-teste-123' },
    })).status, 403);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
    fs.rmSync(folder, { recursive: true, force: true });
    for (const [key, value] of Object.entries(original))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

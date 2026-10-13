import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

const mapFetch: typeof fetch = async (url: any, options?: any) => {
  if (String(url).includes('/interpreter')) {
    const importing = String(options?.body).includes('node%2844%29');
    return new Response(JSON.stringify({ elements: importing ? [{ type: 'node', id: 44, lat: 0, lon: 0.004, tags: { amenity: 'restaurant', name: 'Restaurante de teste', 'addr:street': 'Rua de teste' } }] : [
      { type: 'node', id: 11, lat: 0, lon: 0.001, tags: { amenity: 'fuel', name: 'Posto de teste distante' } },
      { type: 'node', id: 12, lat: 0, lon: 0.002, tags: { amenity: 'fuel', name: 'Posto de teste próximo', opening_hours: '24/7', 'addr:street': 'Avenida de teste' } },
      { type: 'node', id: 13, lat: 0, lon: 0.003, tags: { amenity: 'fuel', name: 'Posto de teste desatualizado' } }
    ] }), { status: 200 });
  }
  const distant = String(url).includes('0.001,0'), near = String(url).includes('0.002,0');
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: distant ? 300000 : 100000, legs: distant ? [{ distance: 50000 }, { distance: 250000 }] : near ? [{ distance: 5000 }, { distance: 95000 }] : [{ distance: 100000 }] }] }), { status: 200 });
};

test('manual fuel review and administrator API', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-api-'));
  const filename = path.join(directory, 'test.sqlite'), db = openDatabase(filename);
  const app = createApi({ db, photoDirectory: path.join(directory, 'photos'), mapFetch });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (route: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = (email: string) => call('/auth/register', { email, displayName: email.split('@')[0], password: 'test-password-only', role: 'admin' });
  const contribution = (price: number, observedAt = new Date().toISOString()) => ({ prices: [{ fuelType: 'gasolina_comum', price }], observedAt, confirmed: true });
  let owner: Awaited<ReturnType<typeof call>>, voter: Awaited<ReturnType<typeof call>>, admin: Awaited<ReturnType<typeof call>>;
  let priceId: string, photoId: string, secondPhoto: string, commentId: string;
  const approve = (stationId: number, price: number, extra: any = {}) => call(`/admin/stations/osm:node:${stationId}/prices`, { ...contribution(price), ...extra }, admin.cookie);
  const upload = async (stationId: number, cookie: string, confirmed = true) => {
    const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private test contributor' } } }).toBuffer();
    const form = new FormData(); form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'private-location.jpg');
    form.append('confirmedStation', String(confirmed)); form.append('observedAt', new Date().toISOString());
    const response = await fetch(base + `/stations/osm:node:${stationId}/photos`, { method: 'POST', headers: { Cookie: cookie }, body: form });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    await t.test('only real map records enter discovery and prices are never invented', async () => {
      const result = await call('/stations/search', { points: [[0, 0], [0, 1]] });
      assert.equal(result.status, 200); assert.equal(result.body.stations.length, 3);
      assert.equal(result.body.stations[0].source, 'OpenStreetMap'); assert.deepEqual(result.body.stations[0].prices, []);
      assert.equal((await call('/stations/fake')).status, 404);
    });
    await t.test('signup cannot grant admin permissions; every admin route is protected', async () => {
      assert.equal((await call('/stations/osm:node:11/prices', contribution(5))).status, 401);
      owner = await register('owner@example.test'); voter = await register('voter@example.test'); admin = await register('administrator@example.test');
      assert.equal(owner.status, 201); assert.equal(owner.body.user.role, 'user');
      for (const route of ['summary', 'photos', 'prices', 'places', 'users', 'comments', 'reports', 'audit']) {
        assert.equal((await call(`/admin/${route}`, undefined, owner.cookie)).status, 403);
        assert.equal((await call(`/admin/${route}`)).status, 401);
      }
      assert.equal((await call('/admin/places', { reference: 'osm:node:44' }, owner.cookie)).status, 403);
      assert.equal((await call('/auth/login', { email: 'owner@example.test', password: 'wrong' })).status, 401);
      assert.equal((await call('/auth/login', { email: ' OWNER@EXAMPLE.TEST ', password: 'test-password-only' })).status, 200);
      assert.ok(!(db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.body.user.id) as any).password_hash.includes('test-password-only'));
      db.prepare('UPDATE users SET role=? WHERE id=?').run('admin', admin.body.user.id);
    });
    await t.test('all user prices await admin approval and cannot replace an existing price', async () => {
      assert.equal((await call('/stations/osm:node:11/prices', { ...contribution(5), confirmed: false }, owner.cookie)).status, 400);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(-5), owner.cookie)).status, 400);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(5, new Date(Date.now() + 86400000).toISOString()), owner.cookie)).status, 400);
      const pending = await call('/stations/osm:node:11/prices', { ...contribution(5), userId: voter.body.user.id }, owner.cookie);
      assert.equal(pending.status, 201); assert.equal(pending.body.entries[0].status, 'pending_review'); assert.deepEqual(pending.body.station.prices, []);
      const pendingId = pending.body.entries[0].id;
      assert.equal((db.prepare('SELECT user_id FROM prices WHERE id=?').get(pendingId) as any).user_id, owner.body.user.id);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(5.1), owner.cookie)).status, 429);
      assert.equal((await call('/admin/stations/osm:node:11/prices', contribution(5), owner.cookie)).status, 403);
      const published = await approve(11, 5, { pendingPriceId: pendingId }); assert.equal(published.status, 201); priceId = published.body.ids[0];
      assert.equal((await call('/stations/osm:node:11')).body.prices[0].price, 5);
      const other = await call('/stations/osm:node:11/prices', contribution(15), voter.cookie);
      assert.equal(other.body.station.prices[0].price, 5);
      assert.equal((await call(`/admin/review/prices/${other.body.entries[0].id}`, { action: 'reject', notes: 'Valor incompatível' }, admin.cookie)).status, 200);
    });
    await t.test('voting remains unique and other contributors must confirm a published price', async () => {
      assert.equal((await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, owner.cookie)).status, 400);
      assert.equal((await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie)).body.prices[0].confirmations, 1);
      assert.equal((await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie)).body.prices[0].confirmations, 1);
      assert.equal((await call(`/prices/${priceId}/vote`, { vote: 'contest' }, voter.cookie)).body.prices[0].disputed, true);
      await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie);
    });
    await t.test('road costs, remaining range and stale price exclusions still work', async () => {
      assert.equal((await approve(12, 5.5)).status, 201);
      assert.equal((await approve(13, 4, { observedAt: new Date(Date.now() - 96 * 3600000).toISOString() })).status, 201);
      const result = await call('/fuel/compare', { routePath: [[0, 0], [0, 1]], fuelType: 'gasolina_comum', consumptionKmPerLiter: 10, remainingFuelLiters: 1, litersToBuy: 20, tankCapacityLiters: 50 });
      assert.equal(result.status, 200); assert.equal(result.body.results[0].station.id, 'osm:node:12'); assert.equal(result.body.results[0].totalCost, 110);
      assert.equal(result.body.results[1].totalCost, 200); assert.equal(result.body.results[1].reachable, false); assert.equal(result.body.stationsWithNoFreshPrice, 1);
    });
    await t.test('photos require station confirmation, stay private, have metadata stripped and produce no OCR drafts', async () => {
      assert.equal((await upload(12, voter.cookie!, false)).status, 400);
      const uploaded = await upload(12, voter.cookie!); assert.equal(uploaded.status, 201); photoId = uploaded.body.photoId;
      assert.equal(uploaded.body.message, 'Foto enviada para análise'); assert.equal(uploaded.body.prices, undefined);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      const ownImage = await fetch(base + `/photos/${photoId}`, { headers: { Cookie: voter.cookie! } });
      assert.equal(ownImage.status, 200); assert.equal((await sharp(Buffer.from(await ownImage.arrayBuffer())).metadata()).exif, undefined);
      assert.equal((db.prepare('SELECT COUNT(*) AS count FROM prices WHERE photo_id=?').get(photoId) as any).count, 0);
      assert.equal((await call('/stations/osm:node:12')).body.prices[0].price, 5.5);
      const second = await upload(11, owner.cookie!); assert.equal(second.status, 201); secondPhoto = second.body.photoId;
      assert.equal((await upload(11, owner.cookie!)).status, 429);
      const queue = await call('/admin/photos', undefined, admin.cookie);
      assert.equal(queue.body.items[0].id, secondPhoto); assert.equal(queue.body.items[1].address, 'Avenida de teste');
      assert.equal(queue.body.items[1].contributor, 'voter'); assert.ok(queue.body.items[1].history.length); assert.equal(queue.body.items[0].image_data, undefined);
    });
    await t.test('requesting a new photo records a reason visible only to the owner/admin', async () => {
      assert.equal((await call(`/admin/review/photos/${secondPhoto}`, { action: 'request_new' }, admin.cookie)).status, 400);
      assert.equal((await call(`/admin/review/photos/${secondPhoto}`, { action: 'request_new', notes: 'Envie uma placa legível' }, admin.cookie)).status, 200);
      const own = await call('/stations/osm:node:11/my-photos', undefined, owner.cookie);
      assert.equal(own.body[0].status, 'new_requested'); assert.equal(own.body[0].reviewNote, 'Envie uma placa legível');
    });
    await t.test('deleting an uploaded photo cannot reset the daily quota', async () => {
      for (let i = 0; i < 9; i++) db.prepare('INSERT INTO photo_uploads VALUES(?,?,?)').run(`quota-fixture-${i}`, owner.body.user.id, new Date().toISOString());
      assert.equal((await call(`/photos/${secondPhoto}`, {}, owner.cookie, 'DELETE')).status, 200);
      const blocked = await upload(11, owner.cookie!); assert.equal(blocked.status, 429); assert.ok(blocked.body.error.includes('diário'));
    });
    await t.test('admin publication links evidence and preserves absent fuel values and prior history', async () => {
      const approved = await approve(12, 5.9, { photoId }); assert.equal(approved.status, 201);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 200);
      const price = (await call('/stations/osm:node:12')).body.prices[0]; assert.equal(price.price, 5.9); assert.equal(price.source, 'photo');
      assert.equal((await call('/stations/osm:node:12')).body.prices.length, 1);
      const corrected = await approve(12, 5.8); assert.equal(corrected.status, 201);
      assert.equal((db.prepare('SELECT supersedes_id FROM prices WHERE id=?').get(corrected.body.ids[0]) as any).supersedes_id, approved.body.ids[0]);
      const history = await call('/admin/places/osm:node:12/history', undefined, admin.cookie);
      assert.ok(history.body.items.some((price: any) => price.price === 5.5)); assert.ok(history.body.items.some((price: any) => price.price === 5.9));
      assert.equal((await approve(12, 5.8, { confirmed: false })).status, 400);
    });
    await t.test('photo reports hide evidence until reviewed and cannot be spammed', async () => {
      assert.equal((await call(`/photos/${photoId}/report`, { reason: 'dados_pessoais', details: 'Revisar fotografia' }, owner.cookie)).status, 201);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      assert.equal((await call(`/photos/${photoId}/report`, { reason: 'spam' }, owner.cookie)).status, 404);
      assert.equal((await call('/admin/reports', undefined, admin.cookie)).body.total, 1);
      assert.equal((await call('/admin/photos', undefined, admin.cookie)).body.total, 1);
    });
    await t.test('establishments must be verified through maps; deleted places cannot reappear from discovery', async () => {
      assert.equal((await call('/admin/places', { reference: 'https://evil.example/map' }, admin.cookie)).status, 422);
      assert.equal((await call('/admin/places', { reference: 'osm:node:999' }, admin.cookie)).status, 422);
      const imported = await call('/admin/places', { reference: 'https://www.openstreetmap.org/node/44' }, admin.cookie);
      assert.equal(imported.status, 201); assert.equal(imported.body.kind, 'restaurant');
      assert.equal((await call('/admin/places', { reference: 'osm:node:44' }, admin.cookie)).status, 409);
      assert.equal((await call('/places/search', { points: [[0, 0]] })).body.places[0].id, 'osm:node:44');
      const update = { name: 'Restaurante revisado', address: 'Rua conferida', active: true, description: 'Comida caseira', website: 'https://example.test' };
      assert.equal((await call('/admin/places/osm:node:44', { ...update, website: 'javascript:alert(1)' }, admin.cookie, 'PATCH')).status, 400);
      assert.equal((await call('/admin/places/osm:node:44', update, admin.cookie, 'PATCH')).status, 200);
      assert.equal((await call('/places/osm:node:44')).body.name, 'Restaurante revisado');
      assert.equal((await call('/admin/places/osm:node:11', { confirmed: false }, admin.cookie, 'DELETE')).status, 400);
      assert.equal((await call('/admin/places/osm:node:11', { confirmed: true }, admin.cookie, 'DELETE')).status, 200);
      assert.equal((await call('/stations/osm:node:11')).status, 404);
      assert.equal((await call('/stations/search', { points: [[0, 0], [0, 1]] })).body.stations.some((s: any) => s.id === 'osm:node:11'), false);
      assert.equal((await call('/admin/photos?page=0', undefined, admin.cookie)).status, 400);
    });
    await t.test('comments wait for admin approval, can be reported and removed', async () => {
      assert.equal((await call('/places/osm:node:44/comments', { body: 'Bom local' })).status, 401);
      assert.equal((await call('/places/osm:node:44/comments', { body: 'Bom local' }, voter.cookie)).status, 201);
      assert.equal((await call('/places/osm:node:44/comments')).body.total, 0);
      commentId = (await call('/admin/comments', undefined, admin.cookie)).body.items[0].id;
      assert.equal((await call(`/admin/review/comments/${commentId}`, { action: 'approve' }, owner.cookie)).status, 403);
      assert.equal((await call(`/admin/review/comments/${commentId}`, { action: 'approve' }, admin.cookie)).status, 200);
      assert.equal((await call('/places/osm:node:44/comments')).body.items[0].body, 'Bom local');
      assert.equal((await call(`/comments/${commentId}/report`, { details: 'Revisar comentário' }, owner.cookie)).status, 201);
      assert.equal((await call(`/admin/review/comments/${commentId}`, { action: 'delete' }, admin.cookie)).status, 200);
      assert.equal((await call('/places/osm:node:44/comments')).body.total, 0);
    });
    await t.test('blocking revokes sessions; deletion removes personal data but preserves approved history', async () => {
      assert.equal((await call(`/admin/users/${admin.body.user.id}`, { action: 'delete', confirmed: true }, admin.cookie)).status, 400);
      assert.equal((await call(`/admin/users/${voter.body.user.id}`, { action: 'block' }, admin.cookie)).status, 200);
      assert.equal((await call('/auth/me', undefined, voter.cookie)).body.user, null);
      assert.equal((await call('/auth/login', { email: 'voter@example.test', password: 'test-password-only' })).status, 401);
      assert.equal((await call(`/admin/users/${voter.body.user.id}`, { action: 'unblock' }, admin.cookie)).status, 200);
      assert.equal((await call('/auth/login', { email: 'voter@example.test', password: 'test-password-only' })).status, 200);
      assert.equal((await call(`/admin/users/${voter.body.user.id}`, { action: 'delete' }, admin.cookie)).status, 400);
      assert.equal((await call(`/admin/users/${voter.body.user.id}`, { action: 'delete', confirmed: true }, admin.cookie)).status, 200);
      const account = db.prepare('SELECT * FROM users WHERE id=?').get(voter.body.user.id) as any;
      assert.equal(account.display_name, 'Usuário excluído'); assert.ok(account.deleted_at); assert.equal(account.password_hash, '');
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      assert.equal((db.prepare('SELECT COUNT(*) AS count FROM votes WHERE user_id=?').get(voter.body.user.id) as any).count, 0);
      assert.equal((await call('/stations/osm:node:12')).body.prices[0].price, 5.8);
      assert.ok((await call('/admin/audit', undefined, admin.cookie)).body.total >= 10);
      assert.equal((await upload(13, admin.cookie!)).status, 201);
    });
    await t.test('cross-site requests are rejected and logout revokes access', async () => {
      assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: owner.cookie! } })).status, 403);
      assert.equal((await call('/auth/logout', {}, owner.cookie)).status, 200);
      assert.equal((await call('/places/osm:node:44/comments', { body: 'Não publicar' }, owner.cookie)).status, 401);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    const reopened = openDatabase(filename);
    assert.ok((reopened.prepare("SELECT COUNT(*) AS count FROM prices WHERE status='published'").get() as any).count >= 4);
    assert.ok((reopened.prepare('SELECT length(image_data) AS bytes FROM photos').get() as any).bytes > 0);
    reopened.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});

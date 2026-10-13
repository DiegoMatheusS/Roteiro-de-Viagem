import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

const mapFetch: typeof fetch = async (url: any) => {
  if (String(url).includes('/interpreter')) return new Response(JSON.stringify({ elements: [
    { type: 'node', id: 11, lat: 0, lon: 0.001, tags: { amenity: 'fuel', name: 'Posto de teste distante' } },
    { type: 'node', id: 12, lat: 0, lon: 0.002, tags: { amenity: 'fuel', name: 'Posto de teste próximo', opening_hours: '24/7' } },
    { type: 'node', id: 13, lat: 0, lon: 0.003, tags: { amenity: 'fuel', name: 'Posto de teste desatualizado' } }
  ] }), { status: 200 });
  const distant = String(url).includes('0.001,0');
  const near = String(url).includes('0.002,0');
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: distant ? 300000 : 100000, legs: distant ? [{ distance: 50000 }, { distance: 250000 }] : near ? [{ distance: 5000 }, { distance: 95000 }] : [{ distance: 100000 }] }] }), { status: 200 });
};

test('fuel API: authentication, persistence, contributions, voting, spam, moderation and road costs', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-api-'));
  const filename = path.join(directory, 'test.sqlite');
  const db = openDatabase(filename);
  const app = createApi({ db, photoDirectory: path.join(directory, 'photos'), mapFetch, ocr: async () => ({ prices: [{ fuelType: 'gasolina_comum', price: 5.9 }], message: 'Revise os valores.' }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as any;
  const base = `http://127.0.0.1:${address.port}/api`;
  const call = async (route: string, body?: unknown, cookie?: string, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = (email: string) => call('/auth/register', { email, displayName: 'Viajante de teste', password: 'test-password-only', role: 'moderator' });
  const contribution = (price: number, observedAt = new Date().toISOString()) => ({ prices: [{ fuelType: 'gasolina_comum', price }], observedAt, confirmed: true });
  let owner: Awaited<ReturnType<typeof call>>;
  let voter: Awaited<ReturnType<typeof call>>;
  let admin: Awaited<ReturnType<typeof call>>;
  let priceId: string;
  let photoId: string;
  try {
    await t.test('only map API establishments enter the station database; no prices are fabricated', async () => {
      const result = await call('/stations/search', { points: [[0, 0], [0, 1]] });
      assert.equal(result.status, 200); assert.equal(result.body.stations.length, 3);
      assert.equal(result.body.stations[0].source, 'OpenStreetMap');
      assert.deepEqual(result.body.stations[0].prices, []);
      assert.equal((await call('/stations/fake')).status, 404);
    });
    await t.test('anonymous and forged identities cannot contribute; signup never grants moderator role', async () => {
      assert.equal((await call('/stations/osm:node:11/prices', { ...contribution(5), userId: 'forged' })).status, 401);
      owner = await register('owner@example.test'); voter = await register('voter@example.test'); admin = await register('moderator@example.test');
      assert.equal(owner.status, 201); assert.equal(owner.body.user.role, 'user');
      assert.equal((await call('/moderation', undefined, owner.cookie)).status, 403);
      const invalidLogin = await call('/auth/login', { email: 'owner@example.test', password: 'wrong' });
      assert.equal(invalidLogin.status, 401);
      assert.equal((await call('/auth/login', { email: ' OWNER@EXAMPLE.TEST ', password: 'test-password-only' })).status, 200);
      const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner.body.user.id) as any;
      assert.ok(!row.password_hash.includes('test-password-only'));
      db.prepare('UPDATE users SET role=? WHERE id=?').run('moderator', admin.body.user.id);
    });
    await t.test('prices require explicit confirmation, valid values and observation date; actor is server-derived', async () => {
      assert.equal((await call('/stations/osm:node:11/prices', { ...contribution(5), confirmed: false }, owner.cookie)).status, 400);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(-5), owner.cookie)).status, 400);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(5, new Date(Date.now() + 86400000).toISOString()), owner.cookie)).status, 400);
      const published = await call('/stations/osm:node:11/prices', { ...contribution(5), userId: voter.body.user.id }, owner.cookie);
      assert.equal(published.status, 201); priceId = published.body.entries[0].id;
      assert.equal((db.prepare('SELECT user_id FROM prices WHERE id=?').get(priceId) as any).user_id, owner.body.user.id);
      assert.equal((await call('/stations/osm:node:11/prices', contribution(5.1), owner.cookie)).status, 429);
    });
    await t.test('voting is one vote per other authenticated user, never a self-confirmation', async () => {
      assert.equal((await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, owner.cookie)).status, 400);
      const result = await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie);
      assert.equal(result.status, 200); assert.equal(result.body.prices[0].confirmations, 1);
      const repeat = await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie);
      assert.equal(repeat.body.prices[0].confirmations, 1);
      const disputed = await call(`/prices/${priceId}/vote`, { vote: 'contest' }, voter.cookie);
      assert.equal(disputed.body.prices[0].confirmations, 0); assert.equal(disputed.body.prices[0].disputed, true);
      await call(`/prices/${priceId}/vote`, { vote: 'confirm' }, voter.cookie);
    });
    await t.test('incompatible price changes wait for moderation; regular users cannot approve', async () => {
      const pending = await call('/stations/osm:node:11/prices', contribution(15), voter.cookie);
      assert.equal(pending.status, 201); assert.equal(pending.body.entries[0].status, 'pending_review');
      const pendingId = pending.body.entries[0].id;
      assert.equal(pending.body.station.prices[0].price, 5);
      assert.equal((await call(`/moderation/prices/${pendingId}`, { action: 'approve' }, owner.cookie)).status, 403);
      assert.equal((await call(`/moderation/prices/${pendingId}`, { action: 'reject', notes: 'Valor incompatível' }, admin.cookie)).status, 200);
    });
    await t.test('cheaper liter loses to lower total cost; stale prices and unreachable stops are flagged', async () => {
      assert.equal((await call('/stations/osm:node:12/prices', contribution(5.5), owner.cookie)).status, 201);
      assert.equal((await call('/stations/osm:node:13/prices', contribution(4, new Date(Date.now() - 96 * 3600000).toISOString()), owner.cookie)).status, 201);
      const result = await call('/fuel/compare', { routePath: [[0, 0], [0, 1]], fuelType: 'gasolina_comum', consumptionKmPerLiter: 10, remainingFuelLiters: 1, litersToBuy: 20, tankCapacityLiters: 50 });
      assert.equal(result.status, 200);
      assert.equal(result.body.results[0].station.id, 'osm:node:12'); assert.equal(result.body.results[0].totalCost, 110);
      assert.equal(result.body.results[1].totalCost, 200); assert.equal(result.body.results[1].reachable, false);
      assert.equal(result.body.stationsWithNoFreshPrice, 1);
      assert.equal(result.body.results[0].station.openingHoursVerifiedAt, undefined);
    });
    await t.test('photos and OCR drafts remain private and cannot publish without user confirmation', async () => {
      const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private test contributor' } } }).toBuffer();
      const form = new FormData(); form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'private-location.jpg');
      const response = await fetch(base + '/stations/osm:node:12/photos', { method: 'POST', headers: { Cookie: voter.cookie! }, body: form });
      const uploaded = await response.json() as any;
      assert.equal(response.status, 201); photoId = uploaded.photoId;
      assert.equal(uploaded.prices[0].price, 5.9);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      const ownImage = await fetch(base + `/photos/${photoId}`, { headers: { Cookie: voter.cookie! } });
      assert.equal(ownImage.status, 200); assert.equal((await sharp(Buffer.from(await ownImage.arrayBuffer())).metadata()).exif, undefined);
      assert.equal((db.prepare('SELECT COUNT(*) AS count FROM prices WHERE photo_id=?').get(photoId) as any).count, 0);
      const publish = await call('/stations/osm:node:12/prices', { ...contribution(5.9), photoId, confirmed: true }, voter.cookie);
      assert.equal(publish.status, 201);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      assert.equal((await call(`/moderation/photos/${photoId}`, { action: 'approve' }, admin.cookie)).status, 200);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 200);
    });
    await t.test('photo reports hide the image again, enter moderation and prevent duplicate spam', async () => {
      const reported = await call(`/photos/${photoId}/report`, { reason: 'dados_pessoais', details: 'Revisar foto de teste' }, owner.cookie);
      assert.equal(reported.status, 201);
      assert.equal((await fetch(base + `/photos/${photoId}`)).status, 404);
      assert.equal((await call(`/photos/${photoId}/report`, { reason: 'spam' }, owner.cookie)).status, 404);
      const queue = await call('/moderation', undefined, admin.cookie);
      assert.equal(queue.body.reports.length, 1); assert.equal(queue.body.photos.length, 1);
    });
    await t.test('cross-site requests are rejected and logout revokes the session', async () => {
      const crossSite = await fetch(base + '/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: owner.cookie! } });
      assert.equal(crossSite.status, 403);
      assert.equal((await call('/auth/logout', {}, owner.cookie)).status, 200);
      assert.equal((await call('/stations/osm:node:13/prices', contribution(5), owner.cookie)).status, 401);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    const reopened = openDatabase(filename);
    assert.ok((reopened.prepare('SELECT COUNT(*) AS count FROM prices').get() as any).count >= 4);
    assert.ok((reopened.prepare('SELECT length(image_data) AS bytes FROM photos').get() as any).bytes > 0);
    reopened.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});

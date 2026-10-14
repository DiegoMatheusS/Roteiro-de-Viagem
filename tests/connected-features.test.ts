import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { tollPassages } from '../server/tolls';
import type { Coordinates } from '../server/maps';
import sharp from 'sharp';

const road: Coordinates[] = [[0, 0], [0, 0.01], [0, 0.02], [0, 0.01], [0, 0]];
const mapFetch: typeof fetch = async () => new Response(JSON.stringify({ elements: [
  { type: 'node', id: 811, lat: 0, lon: 0.01, tags: { barrier: 'toll_booth', name: 'Pedágio de teste' } },
  { type: 'node', id: 812, lat: 0.0001, lon: 0.01, tags: { barrier: 'toll_booth', name: 'Outra faixa da mesma praça' } },
  { type: 'node', id: 813, lat: 0.02, lon: 0.01, tags: { barrier: 'toll_booth', name: 'Fora da estrada' } }
] }));
const weatherFetch: typeof fetch = async (input) => {
  const url = new URL(String(input)), count = url.searchParams.get('latitude')!.split(',').length;
  const start = Math.floor(Date.now() / 3600000) * 3600000;
  const time = Array.from({ length: 16 * 24 }, (_, index) => new Date(start + index * 3600000).toISOString().slice(0, 19));
  return new Response(JSON.stringify(Array.from({ length: count }, (_, index) => ({ hourly: { time, temperature_2m: time.map(() => 22), precipitation_probability: time.map(() => index === 1 ? 80 : 10), weather_code: time.map(() => index === 1 ? 61 : 0), wind_speed_10m: time.map(() => 12) } }))));
};
test('road proximity counts each crossing and ignores roads farther away', () => {
  assert.equal(tollPassages(road, [0, 0.01]).length, 2);
  assert.equal(tollPassages(road, [0.02, 0.01]).length, 0);
});
test('weather, moderated tolls and shared convoy enforce actual accounts and consent', async t => {
  const db = openDatabase(':memory:');
  const server = createApi({ db, mapFetch, weatherFetch }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (path: string, body?: any, cookie?: string, method = body == null ? 'GET' : 'POST') => {
    const response = await fetch(base + path, { method, headers: { ...(body == null ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = (name: string) => call('/auth/register', { email: `${name}@connected.test`, displayName: name, password: 'test-password-long' });
  try {
    const owner = await register('owner'), rider = await register('rider'), stranger = await register('stranger'), admin = await register('admin');
    db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.body.user.id);
    await t.test('real provider weather has times, coordinates, attribution and no invented fallback', async () => {
      const result = await call('/weather/route', { routePath: road, drivingMinutes: 120 });
      assert.equal(result.status, 200); assert.equal(result.body.source, 'Open-Meteo'); assert.equal(result.body.hasRainRisk, true);
      assert.equal(result.body.weatherPoints.length, 5); assert.deepEqual(result.body.weatherPoints[0].coords, road[0]);
      assert.equal(result.body.weatherPoints[1].rainProb, 80); assert.equal(result.body.weatherPoints[1].condition, 'Chuva Fraca');
      assert.equal((await call('/weather/route', { routePath: road, drivingMinutes: -1 })).status, 400);
      assert.equal((await call('/weather/route', { routePath: road, drivingMinutes: 120, departureAt: new Date(Date.now() + 30 * 86400000).toISOString() })).status, 400);
    });
    let contributionId: string;
    await t.test('tolls start unknown; submission is private until approval and lane nodes do not duplicate charges', async () => {
      const result = await call('/tolls/route', { routePath: road, vehicleType: 'car' });
      assert.equal(result.status, 200); assert.equal(result.body.tolls.length, 1); assert.equal(result.body.tolls[0].passages, 2); assert.equal(result.body.tolls[0].price, null); assert.equal(result.body.status, 'unknown');
      const input = { price: 7.5, vehicleType: 'car', observedAt: new Date().toISOString(), confirmed: true };
      assert.equal((await call('/tolls/osm:node:811/contributions', input)).status, 401);
      const sent = await call('/tolls/osm:node:811/contributions', input, owner.cookie);
      assert.equal(sent.status, 201); contributionId = sent.body.id;
      assert.equal((await call('/tolls/route', { routePath: road, vehicleType: 'car' })).body.knownCost, 0);
      assert.equal((await call('/admin/tolls')).status, 401);
      assert.equal((await call(`/admin/tolls/${contributionId}/review`, { action: 'approve', price: 7.5 }, owner.cookie)).status, 403);
      assert.equal((await call(`/admin/tolls/${contributionId}/review`, { action: 'approve', price: 7.5 }, admin.cookie)).status, 200);
      const cost = await call('/tolls/route', { routePath: road, vehicleType: 'car' });
      assert.equal(cost.body.knownCost, 15); assert.equal(cost.body.status, 'partial');
      assert.equal((await call('/tolls/route', { routePath: road, vehicleType: 'motorcycle' })).body.knownCost, 0);
      db.prepare('UPDATE toll_entries SET valid_until=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), contributionId);
      assert.equal((await call('/tolls/route', { routePath: road, vehicleType: 'car' })).body.knownCost, 0);
    });
    await t.test('toll photo remains admin-only and loses original EXIF', async () => {
      const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } }).jpeg().withMetadata().toBuffer();
      const form = new FormData(); form.append('photo', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'private-photo.jpg'); form.append('vehicleType', 'motorcycle'); form.append('observedAt', new Date().toISOString()); form.append('confirmed', 'true');
      const sent = await fetch(base + '/tolls/osm:node:811/contributions', { method: 'POST', headers: { Cookie: rider.cookie! }, body: form });
      assert.equal(sent.status, 201); const id = (await sent.json() as any).id;
      assert.equal((await fetch(base + `/admin/tolls/${id}/photo`, { headers: { Cookie: rider.cookie! } })).status, 403);
      const photo = await fetch(base + `/admin/tolls/${id}/photo`, { headers: { Cookie: admin.cookie! } }); assert.equal(photo.status, 200);
      assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).exif, undefined);
    });
    let group: any;
    await t.test('another phone joins server session with sharing disabled; outsiders cannot read or modify it', async () => {
      const created = await call('/convoys', { title: 'Grupo de teste', trip: { id: 'trip-real', title: 'Roteiro de teste', originName: 'Origem', destinationName: 'Destino', routePath: road }, organizerUser: { id: stranger.body.user.id, vehicleType: 'motorcycle' }, meetingPoints: [] }, owner.cookie);
      assert.equal(created.status, 201); group = created.body; assert.equal(group.organizerId, owner.body.user.id); assert.equal(group.participants[0].isSharingLocation, false);
      assert.equal((await call(`/convoys/${group.id}`, undefined, stranger.cookie)).status, 404);
      const joined = await call('/convoys/join', { code: group.code, vehicleType: 'motorcycle', id: owner.body.user.id }, rider.cookie);
      assert.equal(joined.status, 200); assert.equal(joined.body.participants.length, 2); assert.equal(joined.body.participants.find((p: any) => p.id === rider.body.user.id).id, rider.body.user.id); assert.equal(joined.body.participants.find((p: any) => p.id === rider.body.user.id).isSharingLocation, false);
      assert.equal((await call(`/convoys/${group.id}/end`, {}, rider.cookie)).status, 403);
    });
    await t.test('fresh GPS is shared only after consent; late updates cannot undo revocation; stale positions disappear', async () => {
      const input = { enabled: true, coords: [0, 0.01], timestamp: new Date().toISOString(), accuracyMeters: 4, participantId: owner.body.user.id };
      assert.equal((await call(`/convoys/${group.id}/location`, input, rider.cookie, 'PUT')).status, 409);
      assert.equal((await call(`/convoys/${group.id}/location`, { enabled: true }, rider.cookie, 'PUT')).status, 200);
      assert.equal((await call(`/convoys/${group.id}/location`, input, rider.cookie, 'PUT')).status, 200);
      let read = await call(`/convoys/${group.id}`, undefined, owner.cookie);
      assert.deepEqual(read.body.participants.find((p: any) => p.id === rider.body.user.id).coords, [0, 0.01]);
      assert.equal(read.body.participants.find((p: any) => p.id === owner.body.user.id).coords, undefined);
      db.prepare('UPDATE convoy_members SET location_at=? WHERE user_id=?').run(new Date(Date.now() - 181000).toISOString(), rider.body.user.id);
      read = await call(`/convoys/${group.id}`, undefined, owner.cookie); assert.equal(read.body.participants.find((p: any) => p.id === rider.body.user.id).coords, undefined); assert.equal(read.body.participants.find((p: any) => p.id === rider.body.user.id).isStale, true);
      await call(`/convoys/${group.id}/location`, { enabled: false }, rider.cookie, 'PUT');
      assert.equal((await call(`/convoys/${group.id}/location`, input, rider.cookie, 'PUT')).status, 409);
      assert.equal((await call(`/convoys/${group.id}/end`, {}, owner.cookie)).status, 200);
      assert.equal((await call(`/convoys/${group.id}/location`, { enabled: true }, rider.cookie, 'PUT')).status, 409);
      assert.equal((await call(`/convoys/${group.id}`, undefined, rider.cookie)).body.participants.every((p: any) => !p.isSharingLocation && !p.coords), true);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

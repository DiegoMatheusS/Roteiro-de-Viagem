import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { lookupMapPlace } from '../server/maps';

async function fixture(mapFetch: typeof fetch = async () => new Response('{"elements":[]}')) {
  const db = openDatabase(':memory:');
  const server = createApi({ db, mapFetch }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (route: string, body?: unknown, cookie = '', method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as any, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
  const account = await call('/auth/register', { email: 'admin-places@example.test', displayName: 'Administrador', password: 'test-password-long-123' });
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(account.body.user.id);
  return { db, call, cookie: account.cookie, close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); } };
}
const draft = { name: 'Local cadastrado', kind: 'fuel', lat: -23.55, lng: -46.63, address: 'Endereço conferido, São Paulo/SP', description: 'Descrição do local', phone: '11999999999', website: 'https://example.test', openingHours: '24/7' };

test('admin cadastra todos os tipos solicitados e o app os encontra sem depender do provedor de mapas', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/admin/places', draft)).status, 401);
    const ordinary = await f.call('/auth/register', { email: 'traveler@example.test', displayName: 'Viajante', password: 'test-password-long-123' });
    assert.equal((await f.call('/admin/places', draft, ordinary.cookie)).status, 403);
    for (const kind of ['fuel', 'restaurant', 'toll', 'supermarket', 'shopping', 'waterfall', 'inn', 'hotel']) {
      const created = await f.call('/admin/places', { ...draft, kind }, f.cookie);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.kind, kind);
      assert.equal(created.body.description, draft.description);
      assert.ok(created.body.id.startsWith('admin:'));
      assert.ok(created.body.sourceUrl.includes('mlat=-23.55'));
      assert.equal((await f.call(`/places/${encodeURIComponent(created.body.id)}`)).body.name, draft.name);
    }
    const stations = await f.call('/stations/search', { points: [[draft.lat, draft.lng]] });
    assert.equal(stations.body.stations.length, 1);
    const places = await f.call('/places/search', { points: [[draft.lat, draft.lng]] });
    assert.deepEqual(places.body.places.map((p: any) => p.kind).sort(), ['restaurant', 'toll', 'supermarket', 'shopping', 'waterfall', 'inn', 'hotel'].sort());
    assert.equal((await f.call('/admin/places', draft, f.cookie)).status, 409);
  } finally { await f.close(); }
});

test('cadastro manual rejeita categoria, coordenadas e site inválidos', async () => {
  const f = await fixture();
  try {
    for (const patch of [{ kind: 'invalid' }, { lat: null }, { lat: '' }, { lat: 91 }, { lng: -181 }, { website: 'javascript:alert(1)' }, { name: ' ' }, { address: '' }]) {
      const result = await f.call('/admin/places', { ...draft, ...patch }, f.cookie);
      assert.equal(result.status, 400, JSON.stringify(patch));
    }
    assert.equal((f.db.prepare('SELECT COUNT(*) AS count FROM stations').get() as any).count, 0);
  } finally { await f.close(); }
});

test('pedágio manual publica tarifas por categoria, atualiza posição e respeita exclusão e reativação', async () => {
  const f = await fixture();
  try {
    const place = (await f.call('/admin/places', { ...draft, kind: 'toll', lat: 0, lng: 0.01 }, f.cookie)).body;
    const route = { routePath: [[0, 0], [0, 0.02]], vehicleType: 'car' };
    const observedAt = new Date().toISOString();
    const endpoint = `/admin/places/${encodeURIComponent(place.id)}/tariffs`;
    assert.equal((await f.call(endpoint, { confirmed: true, vehicleType: 'car', price: 12.123, observedAt }, f.cookie)).status, 400);
    assert.equal((await f.call(endpoint, { confirmed: true, vehicleType: 'car', price: 12.5, observedAt }, f.cookie)).status, 201);
    assert.equal((await f.call(endpoint, { confirmed: true, vehicleType: 'motorcycle', price: 0, observedAt }, f.cookie)).status, 201);
    assert.equal((await f.call('/tolls/route', route)).body.knownCost, 12.5);
    assert.equal((await f.call('/tolls/route', { ...route, vehicleType: 'motorcycle' })).body.tolls[0].price, 0);
    const edit = `/admin/places/${encodeURIComponent(place.id)}`;
    const body = { ...draft, name: 'Pedágio revisado', active: true, lat: 0, lng: 0.011 };
    assert.equal((await f.call(edit, body, f.cookie, 'PATCH')).status, 200);
    const updated = (await f.call('/tolls/route', route)).body.tolls[0];
    assert.equal(updated.name, body.name); assert.deepEqual(updated.coords, [0, 0.011]);
    assert.equal((await f.call(edit, { confirmed: true }, f.cookie, 'DELETE')).status, 200);
    assert.equal((await f.call('/tolls/route', route)).body.tolls.length, 0);
    assert.equal((await f.call(edit, body, f.cookie, 'PATCH')).status, 200);
    assert.equal((await f.call('/tolls/route', route)).body.knownCost, 12.5);
    assert.equal((f.db.prepare('SELECT COUNT(*) AS count FROM toll_entries').get() as any).count, 2);
  } finally { await f.close(); }
});

test('importação reconhece cachoeira, pedágio, mercado, shopping e pousada', async () => {
  for (const [tags, kind] of [[{ waterway: 'waterfall' }, 'waterfall'], [{ barrier: 'toll_booth' }, 'toll'], [{ highway: 'toll_gantry' }, 'toll'], [{ shop: 'supermarket' }, 'supermarket'], [{ shop: 'mall' }, 'shopping'], [{ tourism: 'guest_house' }, 'inn']] as const) {
    const place = await lookupMapPlace('https://www.openstreetmap.org/node/456', async () => new Response(JSON.stringify({ elements: [{ type: 'node', id: 456, lat: -23.55, lon: -46.63, tags }] })));
    assert.equal(place.kind, kind);
  }
});

test('comentários de pedágio descoberto no mapa aguardam aprovação do admin', async () => {
  const f = await fixture(async () => new Response(JSON.stringify({ elements: [{ type: 'node', id: 986, lat: 0, lon: 0.01, tags: { barrier: 'toll_booth', name: 'Pedágio dos comentários' } }] })));
  try {
    await f.call('/tolls/route', { routePath: [[0, 0], [0, 0.02]], vehicleType: 'car' });
    const traveler = await f.call('/auth/register', { email: 'commenter@example.test', displayName: 'Viajante', password: 'test-password-long-123' });
    const route = '/places/osm%3Anode%3A986/comments';
    assert.equal((await f.call(route, { body: 'Experiência no pedágio' }, traveler.cookie)).status, 201);
    assert.equal((await f.call(route)).body.items.length, 0);
    const pending = (await f.call('/admin/comments', undefined, f.cookie)).body.items[0];
    assert.equal(pending.placeName, 'Pedágio dos comentários');
    assert.equal((await f.call(`/admin/review/comments/${pending.id}`, { action: 'approve' }, f.cookie)).status, 200);
    assert.equal((await f.call(route)).body.items[0].body, 'Experiência no pedágio');
    assert.equal((await f.call(route, { body: 'Sem login' })).status, 401);
  } finally { await f.close(); }
});

test('admin pode cadastrar, filtrar e publicar novos tipos de pontos turísticos', async () => {
  const f = await fixture();
  try {
    for (const kind of ['beach', 'trail', 'landmark', 'historic', 'nature_reserve', 'attraction', 'museum', 'park', 'viewpoint', 'waterfall']) {
      const result = await f.call('/admin/places', { ...draft, kind }, f.cookie);
      assert.equal(result.status, 201, JSON.stringify(result.body));
    }
    const response = await f.call('/admin/places?group=tourist', undefined, f.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 10);
    assert.ok(response.body.items.every((item: any) => item.kind !== 'fuel'));
  } finally { await f.close(); }
});

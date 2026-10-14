import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

test('private traveler state persists by authenticated account, with safe revision checks', async t => {
  const db = openDatabase(':memory:');
  const server = createApi({ db }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (route: string, method = 'GET', payload?: any, cookie?: string) => {
    const response = await fetch(base + route, { method, headers: { ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload) });
    return { status: response.status, data: await response.json() as any, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = (name: string) => call('/auth/register', 'POST', { displayName: name, email: `${name.toLowerCase()}@example.test`, password: 'test-password-only' });
  const state = (name: string) => ({
    profile: { id: 'forged-account', name, homeAddress: '', homeCoordinates: null, bio: '',
      verifiedGpsKm: 0, manualKm: 0, completedTripsCount: 0, emergencyContacts: [] },
    vehicles: [], fuelLogs: [], achievements: [], trips: [], activeTrip: null, selectedVehicleId: ''
  });
  try {
    const a = await register('RiderA');
    const b = await register('RiderB');
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    await t.test('anonymous state reads and writes are denied', async () => {
      assert.equal((await call('/me/state')).status, 401);
      assert.equal((await call('/me/state', 'PUT', { state: state('Anon'), revision: 0 })).status, 401);
    });
    await t.test('blank account starts without seeded profile, vehicles or trips', async () => {
      assert.deepEqual((await call('/me/state', 'GET', undefined, a.cookie)).data, { state: null, revision: 0, updatedAt: null });
    });
    await t.test('account is authoritative, not the user id inside snapshot', async () => {
      const saved = await call('/me/state', 'PUT', { state: state('Real Rider'), revision: 0 }, a.cookie);
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.equal(saved.data.revision, 1);
      const sameUser = await call('/me/state', 'GET', undefined, a.cookie);
      assert.equal(sameUser.data.state.profile.name, 'Real Rider');
      assert.equal(sameUser.data.state.profile.id, a.data.user.id);
      assert.deepEqual(sameUser.data.state.trips, []);
      const other = await call('/me/state', 'GET', undefined, b.cookie);
      assert.equal(other.data.state, null);
    });
    await t.test('stale concurrent write cannot overwrite a saved trip', async () => {
      const before = await call('/me/state', 'GET', undefined, a.cookie);
      const trip = { id: 'trip-1', title: 'Passeio próprio', originCoords: [0, 0], destinationCoords: [0, 0.1],
        routePath: [[0, 0], [0, 0.1]], stops: [], vehicleId: '', distanceKm: 10, durationMinutes: 30, status: 'planned' };
      const updated = { ...before.data.state, trips: [trip] };
      assert.equal((await call('/me/state', 'PUT', { state: updated, revision: 1 }, a.cookie)).status, 200);
      const stale = await call('/me/state', 'PUT', { state: state('Overwritten'), revision: 1 }, a.cookie);
      assert.equal(stale.status, 409);
      assert.equal((await call('/me/state', 'GET', undefined, a.cookie)).data.state.trips[0].title, 'Passeio próprio');
      assert.equal((await call('/me/state', 'GET', undefined, b.cookie)).data.state, null);
    });
    await t.test('reject oversized arrays, non-real coordinates and forged foreign records', async () => {
      const invalid = { ...state('Invalid'), trips: [{ id: 'bad', title: 'bad', originCoords: [200, 400], destinationCoords: [0, 0],
        routePath: [], stops: [], vehicleId: '', distanceKm: 0, durationMinutes: 0, status: 'planned' }] };
      assert.equal((await call('/me/state', 'PUT', { state: invalid, revision: 0 }, b.cookie)).status, 400);
      assert.equal((await call('/me/state', 'PUT', { state: { ...state('Invalid'), vehicles: Array.from({ length: 40 }, () => ({})) }, revision: 0 }, b.cookie)).status, 400);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

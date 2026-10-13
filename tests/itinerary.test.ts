import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { applyItinerary } from '../src/services/itinerary';
import { getPlanningAlternatives, buildPlannedTrip } from '../src/services/routeCalculator';
import { moveStop } from '../src/components/ManualStopsEditor';
import type { MandatoryStop } from '../src/types/itinerary';

const orderedRequests: number[][][] = [];
const mapFetch: typeof fetch = async (url: any) => {
  if (String(url).includes('photon')) return new Response(JSON.stringify({ features: [
    { geometry: { type: 'Point', coordinates: [0.1, 0] }, properties: { osm_type: 'N', osm_id: 101, name: 'Cidade Alfa', city: 'Cidade Alfa', osm_value: 'city' } },
    { geometry: { type: 'Point', coordinates: [0.2, 0] }, properties: { osm_type: 'N', osm_id: 102, name: 'Restaurante Beta', city: 'Cidade Beta', osm_value: 'restaurant' } },
    { geometry: { type: 'Point', coordinates: [0.25, 0] }, properties: { osm_type: 'N', osm_id: 104, name: 'Posto pesquisado', osm_value: 'fuel' } },
    { geometry: { type: 'Point', coordinates: [999, 999] }, properties: { osm_type: 'N', osm_id: 999, name: 'Inválido' } }
  ] }));
  const coordinates = String(url).split('/driving/')[1].split('?')[0].split(';').map((p: string) => p.split(',').map(Number));
  orderedRequests.push(coordinates);
  const legs = coordinates.slice(1).map((point: number[], i: number) => ({ distance: (Math.abs(point[0] - coordinates[i][0]) + Math.abs(point[1] - coordinates[i][1])) * 100000,
    duration: (Math.abs(point[0] - coordinates[i][0]) + Math.abs(point[1] - coordinates[i][1])) * 6000 }));
  return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: legs.reduce((sum: number, leg: any) => sum + leg.distance, 0), legs, geometry: { type: 'LineString', coordinates } }] }));
};

test('mandatory itinerary, constraints, suggestions, persistence and public sharing', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-itinerary-'));
  const db = openDatabase(':memory:');
  const server = createApi({ db, photoDirectory: directory, mapFetch }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (route: string, body?: unknown) => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const stops = [{ id: 'stop-a', locationId: 'osm:node:101', stayMinutes: 10 }, { id: 'stop-b', locationId: 'osm:node:102', stayMinutes: 20 }];
  const request = { originCoords: [0, 0], destinationCoords: [0, 0.3], manualStops: stops, limits: { mode: 'km', target: 25 } };
  let computed: any;
  try {
    await t.test('search stores only verified provider records, caches searches and limits external requests', async () => {
      const found = await call('/locations/search?q=Alfa'); assert.equal(found.status, 200); assert.equal(found.body.results.length, 3);
      assert.equal(found.body.results[0].id, 'osm:node:101'); assert.ok(found.body.results[0].sourceUrl.includes('openstreetmap.org'));
      assert.deepEqual((await call('/stations/osm:node:104')).body.prices, []);
      assert.equal((await call('/locations/search?q=Alfa')).body.cached, true);
      assert.equal((await call('/locations/search?q=Outra')).status, 429);
      assert.equal((await call('/locations/search?q=ab')).status, 400);
    });
    await t.test('every mandatory stop enters the road request in its exact order; stays count toward time', async () => {
      computed = await call('/routes/itinerary', request); assert.equal(computed.status, 200);
      assert.deepEqual(orderedRequests[0], [[0, 0], [0.1, 0], [0.2, 0], [0.3, 0]]);
      assert.equal(computed.body.distanceKm, 30); assert.equal(computed.body.durationMinutes, 60); assert.equal(computed.body.drivingMinutes, 30);
      assert.deepEqual(computed.body.manualStops.map((s: any) => s.id), ['stop-a', 'stop-b']); assert.equal(computed.body.exceedsLimit, true);
      assert.ok(computed.body.warnings[0].includes('Nenhuma parada obrigatória foi removida')); assert.equal(computed.body.tollsStatus, 'unknown');
    });
    await t.test('reordering changes actual road distance and honors all three planning modes', async () => {
      const reversed = await call('/routes/itinerary', { ...request, manualStops: [...stops].reverse(), limits: { mode: 'hours', target: 1 } });
      assert.equal(reversed.body.distanceKm, 50); assert.equal(reversed.body.durationMinutes, 80); assert.equal(reversed.body.exceedsLimit, true);
      const destination = await call('/routes/itinerary', { ...request, limits: { mode: 'destination' } }); assert.equal(destination.body.exceedsLimit, false);
      const circular = await call('/routes/itinerary', { ...request, roundTrip: true, limits: { mode: 'km', target: 100 } });
      assert.equal(circular.body.distanceKm, 60); assert.deepEqual(circular.body.waypoints.at(-1), request.originCoords);
    });
    await t.test('tampered coordinates are ignored; unknown locations and incomplete stops are rejected', async () => {
      const edited = await call('/routes/itinerary', { ...request, manualStops: [{ ...stops[0], coords: [50, 50] }] });
      assert.deepEqual(edited.body.manualStops[0].location.coords, [0, 0.1]);
      assert.equal((await call('/routes/itinerary', { ...request, manualStops: [{ ...stops[0], locationId: 'fake' }] })).status, 400);
      assert.equal((await call('/routes/itinerary', { ...request, manualStops: [stops[0], stops[0]] })).status, 400);
      assert.equal((await call('/routes/itinerary', { ...request, manualStops: [{ ...stops[0], stayMinutes: -1 }] })).status, 400);
      assert.equal((await call('/routes/itinerary', { ...request, limits: { mode: 'hours', target: 0 } })).status, 400);
    });
    await t.test('accepting or discarding suggestions never drops or reorders mandatory points', async () => {
      db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,managed) VALUES(?,?,?,?,?,?,?,?,?)').run('osm:node:103', 'Café de teste', 0, 0.11, 'Rua pública', 'https://www.openstreetmap.org/node/103', new Date().toISOString(), 'cafe', 1);
      const withSuggestions = await call('/routes/itinerary', request); assert.equal(withSuggestions.body.suggestions.length, 1);
      const suggestion = withSuggestions.body.suggestions[0];
      const accepted = await call('/routes/itinerary', { ...request, acceptedSuggestions: [{ id: suggestion.id, locationId: suggestion.location.id, stayMinutes: 15, afterIndex: 0 }] });
      assert.deepEqual(accepted.body.waypoints, [[0, 0], [0, 0.1], [0, 0.11], [0, 0.2], [0, 0.3]]);
      assert.deepEqual(accepted.body.manualStops.map((s: any) => s.id), ['stop-a', 'stop-b']); assert.equal(accepted.body.durationMinutes, 75);
      const discarded = await call('/routes/itinerary', request); assert.equal(discarded.body.acceptedSuggestions.length, 0);
    });
    await t.test('planning and JSON persistence preserve mandatory identity, order, fuel costs and stays', () => {
      const template = { id: 'itinerary-test', originName: 'Origem', originCoords: [0, 0], destinationName: 'Destino', destinationCoords: [0, 0.3], modality: 'rapida', isCircular: false, groupVehiclesCount: 1, planningLimits: { mode: 'km', target: 25 }, createdAt: new Date().toISOString() } as any;
      const trip = applyItinerary(template, computed.body);
      const input = { originName: trip.originName, originCoords: trip.originCoords, destinationName: trip.destinationName, destinationCoords: trip.destinationCoords,
        vehicle: { id: 'vehicle', maxPassengers: 4, consumption: { userConfigured: 10 } }, peopleCount: 1, vehicleGroupType: 'single_vehicle', groupVehiclesCount: 1, splitExpenses: false, foodCostPerPerson: 0, fuelPricePerLiter: 5, returnModality: 'rapida' } as any;
      const option = getPlanningAlternatives(input, trip)[0]; assert.equal(option.fuelLiters, 3); assert.equal(option.fuelCost, 15); assert.equal(option.tollsCost, 0);
      const saved = JSON.parse(JSON.stringify(buildPlannedTrip(input, option, trip)));
      assert.deepEqual(saved.manualStops.map((s: any) => s.id), ['stop-a', 'stop-b']); assert.equal(saved.stops[1].recommendedMinutes, 20); assert.equal(saved.stops[0].type, 'mandatory'); assert.equal(saved.durationMinutes, 60); assert.equal(saved.routingSource, 'OSRM');
    });
    await t.test('public share preserves every stop and duration, removes home coordinates and opens without login', async () => {
      const privateOrigin = [0.01234, 0.05678];
      const trip = applyItinerary({ title: 'Saída privada', originName: 'Minha residência', destinationName: 'Destino', originCoords: privateOrigin, destinationCoords: [0, 0.3] } as any, computed.body);
      trip.routePath[0] = privateOrigin as [number, number];
      const shared = await call('/routes/share', { trip, protectOrigin: true }); assert.equal(shared.status, 201);
      const retrieved = await call(`/routes/share/${shared.body.id}`); assert.equal(retrieved.status, 200);
      assert.equal(retrieved.body.stops.length, 2); assert.equal(retrieved.body.stops[0].name, 'Cidade Alfa'); assert.equal(retrieved.body.stops[1].stayMinutes, 20);
      assert.equal(retrieved.body.stops[0].type, 'mandatory'); assert.equal(retrieved.body.durationMinutes, 60);
      assert.equal(retrieved.body.originName, 'Região de partida'); assert.ok(!JSON.stringify(retrieved.body).includes('0.01234')); assert.ok(!JSON.stringify(retrieved.body).includes('Minha residência'));
      assert.equal((await call('/routes/share/not-found')).status, 404);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('drag/reorder helpers preserve all mandatory stops and never drop items', () => {
  const stops = ['a', 'b', 'c'].map(id => ({ id, location: { name: id }, stayMinutes: 10 })) as MandatoryStop[];
  assert.deepEqual(moveStop(stops, 'c', 'a').map(stop => stop.id), ['c', 'a', 'b']);
  assert.equal(moveStop(stops, 'missing', 'a'), stops);
  assert.deepEqual(stops.map(stop => stop.id), ['a', 'b', 'c']);
});

test('migration preserves reviewed prices and history, queues unapproved prices and upgrades moderator access', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-migration-')), file = path.join(folder, 'old.sqlite');
  let db = openDatabase(file);
  db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run('old-admin', 'old@example.test', 'Admin anterior', 'unused', 'moderator', new Date().toISOString());
  db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at) VALUES(?,?,?,?,?,?,?)').run('old-station', 'Posto anterior', 0, 0, '', 'https://www.openstreetmap.org/node/1', new Date().toISOString());
  for (const id of ['approved', 'unreviewed']) db.prepare('INSERT INTO prices(id,station_id,user_id,fuel_type,price,observed_at,created_at,source,status) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'old-station', 'old-admin', id === 'approved' ? 'etanol' : 'gasolina_comum', 5, new Date().toISOString(), new Date().toISOString(), 'manual', 'published');
  db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)').run('approval', 'old-admin', 'prices', 'approved', 'approve', '', new Date().toISOString());
  db.close(); db = openDatabase(file);
  assert.equal((db.prepare('SELECT role FROM users').get() as any).role, 'admin');
  assert.equal((db.prepare("SELECT status FROM prices WHERE id='approved'").get() as any).status, 'published');
  assert.equal((db.prepare("SELECT status FROM prices WHERE id='unreviewed'").get() as any).status, 'pending_review');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM prices').get() as any).count, 2);
  db.close(); fs.rmSync(folder, { recursive: true, force: true });
});

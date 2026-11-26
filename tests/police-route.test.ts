import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { registerPoliceRoute } from '../server/policeRoute';
import { ApiError } from '../server/http';
import { openDatabase } from '../server/db';
import { updatePoliceRoute } from '../src/services/mapLibrePoliceRoute';
import type { PoliceRoute } from '../src/types/policeRoute';

test('SOS routes to the closest public police station by road and handles missing coverage', async () => {
  const origin = [-23.54, -46.61];
  const station = [-23.56, -46.61];
  const tags = { amenity: 'police' };
  const calls: string[] = [];
  let responseMode = 'stations';
  const db = openDatabase(':memory:');
  const app = express();
  app.use(express.json());
  registerPoliceRoute(app, db, async (url, options) => {
    const target = String(url);
    if (options?.method === 'POST') {
      assert.match(new URLSearchParams(String(options.body)).get('data')!, /\["amenity"="police"\]/);
      if (responseMode === 'error') return new Response(null, { status: 503 });
      const elements = responseMode === 'empty' ? [] : [
        { lat: -23.541, lon: -46.61, tags: { ...tags, name: 'Base privada', access: 'private' } },
        { lat: -23.542, lon: -46.61, tags: { ...tags, name: 'Unidade sem acesso rodoviário' } },
        { lat: -23.545, lon: -46.61, tags: { ...tags, name: 'Unidade próxima em linha reta' } },
        { center: { lat: station[0], lon: station[1] }, tags: { ...tags, name: 'Delegacia do teste' } },
        { lat: -23.541, lon: -46.61, tags: { police: 'barracks' } }
      ];
      return Response.json({ elements });
    }
    const [start, end] = new URL(target).pathname.split('/').at(-1)!.split(';');
    calls.push(end);
    const destination = end.split(',').map(Number);
    if (destination[1] === -23.542) return Response.json({ code: 'NoRoute' });
    const distance = destination[1] === station[0] ? 2800 : 6600;
    return Response.json({ code: 'Ok', routes: [{ distance, legs: [{ distance, duration: 400 }],
      geometry: { coordinates: [start.split(',').map(Number), destination] } }] });
  }, () => {});
  app.use((error: ApiError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const search = (originCoords: unknown = origin) => fetch(`http://127.0.0.1:${address.port}/api/sos/police-route`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originCoords })
  });
  try {
    assert.equal((await search([91, 0])).status, 400);
    const response = await search();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      station: { name: 'Delegacia do teste', coords: station }, routePath: [origin, station], distanceKm: 2.8
    });
    assert.deepEqual(calls.sort(), ['-46.61,-23.542', '-46.61,-23.545', '-46.61,-23.56']);
    responseMode = 'empty';
    assert.equal((await search()).status, 404);
    responseMode = 'error';
    assert.equal((await search()).status, 503);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

test('the two police strokes use the same offset and keep the original route layer', () => {
  const layers = new Map<string, { paint?: Record<string, unknown> }>([['role-active-outline', {}]]);
  const sources = new Map<string, unknown>();
  const map = {
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: { id: string; paint: Record<string, unknown> }, before?: string) => {
      if (layer.id !== 'role-police-station') assert.equal(before, 'role-active-outline');
      layers.set(layer.id, layer);
    },
    removeLayer: (id: string) => layers.delete(id),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, source: unknown) => sources.set(id, source),
    removeSource: (id: string) => sources.delete(id)
  } as unknown as MapLibreMap;
  const route: PoliceRoute = { station: { name: 'Delegacia', coords: [-23.55, -46.61] },
    routePath: [[-23.54, -46.61], [-23.55, -46.61]], distanceKm: 1.2 };
  updatePoliceRoute(map, route);
  const blue = layers.get('role-police-route-blue')?.paint;
  const red = layers.get('role-police-route-red')?.paint;
  assert.ok(blue?.['line-offset']);
  assert.deepEqual(red?.['line-offset'], blue['line-offset']);
  assert.deepEqual(red?.['line-dasharray'], [2, 2]);
  assert.equal(layers.size, 4);
  updatePoliceRoute(map);
  assert.deepEqual([...layers.keys()], ['role-active-outline']);
  assert.equal(sources.size, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';

const attractions = [
  { type: 'node', id: 8001, lat: 0, lon: 0.06, tags: { name: 'Mirante de teste', tourism: 'viewpoint' } },
  { type: 'node', id: 8002, lat: 0.04, lon: 0.08, tags: { name: 'Café de teste', amenity: 'cafe' } },
  { type: 'node', id: 8003, lat: 0.06, lon: 0.03, tags: { name: 'Museu de teste', tourism: 'museum' } },
  { type: 'node', id: 8004, lat: 0.02, lon: 0.04, tags: { name: 'Parque de teste', leisure: 'park' } },
  { type: 'node', id: 8005, lat: 0, lon: 0.02, tags: { name: 'Posto não turístico', amenity: 'fuel' } },
  { type: 'node', id: 8006, lat: 0, lon: 0.03, tags: { name: '' , tourism: 'viewpoint' } }
];
function fakeMaps(places: any[] = attractions): typeof fetch {
  return async (url: any, opts?: any) => {
    if (String(url).includes('/interpreter')) {
      assert.match(String(opts?.body || ''), /data=/);
      return new Response(JSON.stringify({ elements: places }));
    }
    const coords = String(url).split('/driving/')[1].split('?')[0].split(';')
      .map((part: string) => part.split(',').map(Number));
    const legs = coords.slice(1).map((point: number[], i: number) => {
      const previous = coords[i];
      const km = (Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1])) * 110;
      return { distance: km * 1000, duration: km * 70 };
    });
    return new Response(JSON.stringify({
      code: 'Ok', routes: [{
        distance: legs.reduce((a: number, b: any) => a + b.distance, 0),
        legs, geometry: { coordinates: coords }
      }]
    }));
  };
}

test('real tourist circuit: OSM evidence, road distance, optional visits and errors', async t => {
  const db = openDatabase(':memory:');
  const server = createApi({ db, mapFetch: fakeMaps() }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const call = async (path: string, body: unknown) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() as any };
  };
  const request = { mode: 'km', target: 30, tripType: 'round_trip', originCoords: [0, 0], interests: [] };
  try {
    await t.test('tourist loop uses real provider stop IDs and full road geometry', async () => {
      const res = await call('/routes/tourist', request);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.isCircular, true);
      assert.deepEqual(res.data.destinationCoords, [0, 0]);
      assert.ok(res.data.distanceKm > 0);
      assert.ok(res.data.durationMinutes > 0);
      assert.equal(res.data.routePath[0][0], 0);
      assert.equal(res.data.routePath.at(-1)[0], 0);
      assert.ok(res.data.stops.length >= 1);
      assert.ok(res.data.stops.every((stop: any) => stop.sourceUrl.startsWith('https://www.openstreetmap.org/node/') && !('rating' in stop)));
      assert.ok(res.data.stops.every((stop: any) => stop.type === 'suggested'));
      const saved = db.prepare('SELECT id FROM locations WHERE id=?').get(res.data.stops[0].locationId);
      assert.ok(saved, 'POI must be persisted by OSM identity for manual itinerary editing');
      const edited = await call('/routes/itinerary', {
        originCoords: [0, 0], destinationCoords: [0, 0], roundTrip: true,
        manualStops: [], acceptedSuggestions: res.data.stops.map((s: any, i: number) => ({
          id: `s-${i}`, locationId: s.locationId, stayMinutes: 20, afterIndex: -1
        })), limits: { mode: 'km', target: 30 }
      });
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      assert.equal(edited.data.acceptedSuggestions.length, res.data.stops.length);
    });
    await t.test('one-way ends at a real attraction, not an invented destination', async () => {
      const res = await call('/routes/tourist', { ...request, tripType: 'one_way', target: 15, interests: ['museus', 'panoramico'] });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.isCircular, false);
      assert.notDeepEqual(res.data.destinationCoords, request.originCoords);
      assert.ok(res.data.stops.every((s: any) => ['museu', 'mirante'].includes(s.category)));
    });
    await t.test('dragging a blue point recomputes a real road, including the same origin on a loop', async()=>{
      const changed=await call('/routes/adjust',{
        waypoints:[[0,0],[0.03,0.04],[0,0]]
      });
      assert.equal(changed.status,200,JSON.stringify(changed.data));
      assert.equal(changed.data.routingSource,'OSRM');
      assert.ok(changed.data.distanceKm>0);
      assert.ok(changed.data.drivingMinutes>0);
      assert.equal(changed.data.routePath.length,3);
      assert.equal((await call('/routes/adjust',{waypoints:[[0,0],[0,0]]})).status,400);
      assert.equal((await call('/routes/adjust',{waypoints:[[0,0],[190,0],[0,0]]})).status,400);
    });
    await t.test('previously visited attraction IDs are accepted and rerolls exclude visited stops',async()=>{
      const first=await call('/routes/tourist',request);
      assert.equal(first.status,200);
      const oldIds=first.data.stops.map((stop:any)=>stop.locationId);
      if(oldIds.length){
        const next=await call('/routes/tourist',{
          ...request,excludePlaceIds:oldIds,visitedPlaceIds:oldIds,
          visitedWaypoints:[first.data.waypoints],avoidWaypoints:[first.data.waypoints]
        });
        assert.equal(next.status,200,JSON.stringify(next.data));
        assert.ok(next.data.stops.every((stop:any)=>!oldIds.includes(stop.locationId)));
      }
      assert.equal((await call('/routes/tourist',{...request,visitedPlaceIds:['a'.repeat(200)]})).status,400);
    });
    await t.test('rejects invalid coordinates and unsupported interests', async () => {
      assert.equal((await call('/routes/tourist', { ...request, target: -2 })).status, 400);
      assert.equal((await call('/routes/tourist', { ...request, interests: ['inventar_local'] })).status, 400);
      assert.equal((await call('/routes/tourist', { ...request, originCoords: [100, 999] })).status, 400);
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

test('sem atrações, gera apenas percurso rodoviário verificado e sem paradas inventadas', async () => {
  const db = openDatabase(':memory:');
  const server = createApi({ db, mapFetch: fakeMaps([]) }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/routes/tourist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'km', target: 30, tripType: 'round_trip', originCoords: [0, 0], interests: [] })
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.routingSource, 'OSRM');
    assert.deepEqual(result.stops, []);
    assert.ok(result.routePath.length >= 2);
    assert.ok(result.warnings.some((warning: string) => warning.includes('sem atrações') || warning.includes('Não foram incluídas atrações')));
    const alternateResponse = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/routes/tourist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'km', target:30, tripType:'round_trip',
        originCoords:[0,0], interests:[], avoidWaypoints:[result.waypoints] })
    });
    assert.equal(alternateResponse.status,200);
    const alternative = await alternateResponse.json() as any;
    assert.notDeepEqual(alternative.waypoints,result.waypoints,
      'Pedir outra rota deve retornar diferentes pontos de passagem em estradas reais');
    assert.equal(alternative.routingSource,'OSRM');
    const invalidResponse = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/routes/tourist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode:'km', target:30, tripType:'round_trip',
        originCoords:[0,0], interests:[], avoidWaypoints:[[[200,0],[0,0]]] })
    });
    assert.equal(invalidResponse.status,400,'Não aceitar coordenadas inválidas no histórico');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

test('roteiro considera pontos turísticos criados no cadastro administrativo', async () => {
  const db = openDatabase(':memory:');
  const name = 'Museu cadastrado pelo Admin';
  db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,active,managed)
    VALUES(?,?,?,?,?,?,?,?,1,1)`).run('admin:museu-1', name, 0, 0.06, 'Rua verificada', 'https://www.openstreetmap.org/?mlat=0&mlon=0.06', new Date().toISOString(), 'museum');
  const server = createApi({ db, mapFetch: fakeMaps([]) }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/routes/tourist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'km', target: 7, tripType: 'one_way', originCoords: [0, 0], interests: ['museus'] })
    });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.ok(result.stops.some((stop: any) => stop.name === name));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
});

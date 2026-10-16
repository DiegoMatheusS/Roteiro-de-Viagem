import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { privateRoadRoute } from '../server/routeCache';

test('searches reuse stored public OSM places and keep private selections scoped to each user', async () => {
  const db = openDatabase(':memory:');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-places-cache-'));
  let requests = 0;
  const photon = async (input: any): Promise<Response> => {
    requests++;
    const url = new URL(String(input));
    assert.ok(url.hostname.includes('photon') || url.hostname.includes('test'));
    return Response.json({ features: [{
      properties: { osm_type: 'N', osm_id: 1111, name: 'Museu Histórico Público',
        street: 'Rua da Cultura', housenumber: '10', city: 'São Paulo',
        state: 'SP', country: 'Brasil', osm_value: 'museum' },
      geometry: { type: 'Point', coordinates: [-46.63,-23.55] }
    }] });
  };
  const api = createApi({ db, photoDirectory: directory, mapFetch: photon as typeof fetch });
  const server = api.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  const base = 'http://127.0.0.1:' + (server.address() as any).port;
  const req = async (route: string, opts: { cookie?: string; body?: unknown; method?: string } = {}) => {
    const response = await fetch(base + '/api' + route, {
      method: opts.method || (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(opts.cookie ? { Cookie: opts.cookie } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    return { code:response.status, data:await response.json() as any, cookie:response.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    const a = await req('/auth/register',{body:{email:'a@example.com',displayName:'Viajante A',password:'safe-password-1234'}});
    const b = await req('/auth/register',{body:{email:'b@example.com',displayName:'Viajante B',password:'safe-password-1234'}});
    assert.equal(a.code,201);assert.equal(b.code,201);

    const first = await req('/locations/search?q=Museu%20Hist%C3%B3rico');
    assert.equal(first.code,200,JSON.stringify(first.data));
    assert.equal(first.data.results.length,1);
    assert.equal(requests,1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM locations').get() as any).n,1);
    const fromDatabase = await req('/locations/search?q=Rua%20da%20Cultura%2C%2010%2C%20S%C3%A3o%20Paulo%2C%20SP%2C%20Brasil');
    assert.equal(fromDatabase.code,200);
    assert.equal(fromDatabase.data.results[0].id,'osm:node:1111');
    assert.equal(requests,1,'exact address must resolve locally without another Photon call');

    const selected = await req('/me/locations',{cookie:a.cookie,body:{locationId:'osm:node:1111'}});
    assert.equal(selected.code,201);
    const privateA = await req('/me/locations',{cookie:a.cookie});
    const privateB = await req('/me/locations',{cookie:b.cookie});
    assert.equal(privateA.data.results.length,1);
    assert.equal(privateB.data.results.length,0);
    assert.equal((await req('/me/locations',{body:{locationId:'osm:node:1111'}})).code,401);
    assert.equal((await req('/me/locations',{cookie:b.cookie,body:{locationId:'fake:address'}})).code,400);
    assert.equal((await req('/me/locations',{cookie:a.cookie,method:'DELETE'})).code,200);
    assert.deepEqual((await req('/me/locations',{cookie:a.cookie})).data.results,[]);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    db.close();fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('private route cache survives process restart in SQLite and has an explicit stale fallback', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-route-cache-'));
  const filename = path.join(directory, 'data.sqlite');
  let db = openDatabase(filename);
  try {
    db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
      .run('owner','owner@example.com','Owner','test','user',new Date().toISOString());
    db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)')
      .run('other','other@example.com','Other','test','user',new Date().toISOString());
    const points: [number,number][] = [[-23.5,-46.61],[-23.5,-46.6]];
    let calls = 0;
    const provider = async () => { calls++;
      return Response.json({ code:'Ok', routes:[{distance:3500,legs:[{distance:3500,duration:360}],
        geometry:{coordinates:[[-46.61,-23.5],[-46.6,-23.5]]}}] });
    };
    const result = await privateRoadRoute(db,'owner',points,provider as typeof fetch,true);
    assert.equal(result.distanceKm,3.5);
    assert.equal(calls,1);
    // Reopening the real database simulates a Railway container restart with the same volume.
    db.close(); db = openDatabase(filename);
    const again = await privateRoadRoute(db,'owner',points,async () => { throw new Error('No provider'); },true);
    assert.equal(again.stored,true);
    assert.equal(again.stale,undefined);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM user_route_cache WHERE user_id=?').get('owner') as any).n,1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM user_route_cache WHERE user_id=?').get('other') as any).n,0);
    const fakeKey='old-router-route-test';
    db.prepare('INSERT INTO user_route_cache(user_id,cache_key,result_json,created_at) VALUES(?,?,?,?)')
      .run('owner',fakeKey,'{}',new Date().toISOString());
    // Add a separate cached route that is older than the fresh window but still usable as a fallback.
    const olderPoints: [number,number][] = [[-24.5,-47.61],[-24.5,-47.6]];
    const { createHash } = await import('node:crypto');
    const cacheKey=createHash('sha256').update(JSON.stringify({origin:'https://router.project-osrm.org',withGeometry:true,
      instructionsVersion:2,points:olderPoints.map(p=>p.map(n=>Number(n.toFixed(6))))})).digest('hex');
    db.prepare('INSERT INTO user_route_cache(user_id,cache_key,result_json,created_at) VALUES(?,?,?,?)')
      .run('owner',cacheKey,JSON.stringify(result),new Date(Date.now()-25*3600_000).toISOString());
    const down = async () => {throw new Error('Service unavailable');};
    const fallback = await privateRoadRoute(db,'owner',olderPoints,down as typeof fetch,true);
    assert.equal(fallback.stored,true);assert.equal(fallback.stale,true);
    await assert.rejects(privateRoadRoute(db,'other',olderPoints,down as typeof fetch,true),/Service unavailable/);
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

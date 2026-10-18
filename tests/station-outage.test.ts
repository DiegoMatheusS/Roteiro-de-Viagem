import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {discoverStations} from '../server/maps';

const points:[[number,number],[number,number]]=[[-23.5,-46.6],[-23.51,-46.61]];
const offline:typeof fetch=async()=>{throw new Error('Provider unavailable');};

test('discovery uses real admin records without fabricating stations when maps are down',async()=>{
  const db=openDatabase(':memory:');
  try {
    const initial=await discoverStations(db,points,5,offline);
    assert.deepEqual(initial,{stationIds:[],cached:false,mapUnavailable:true});
    db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,managed) VALUES(?,?,?,?,?,?,?,1)')
      .run('admin:fuel:1','Posto cadastrado',-23.5,-46.6,'Rua Exemplo','https://www.openstreetmap.org/node/2',new Date().toISOString());
    const fallback=await discoverStations(db,points,5,offline);
    assert.deepEqual(fallback.stationIds,['admin:fuel:1']);
    assert.equal(fallback.mapUnavailable,true);
  } finally { db.close(); }
});

test('station endpoint returns degraded flag instead of HTTP 503',async()=>{
  const db=openDatabase(':memory:');const app=createApi({db,mapFetch:offline});
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {
    const base='http://127.0.0.1:'+((server.address() as any).port)+'/api';
    const call=(p:unknown)=>fetch(base+'/stations/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points:p})});
    const response=await call(points);
    assert.equal(response.status,200);
    const body=await response.json() as any;
    assert.equal(body.mapUnavailable,true);
    assert.deepEqual(body.stations,[]);
    assert.equal((await call(Array.from({length:26},()=>[0,0]))).status,400);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve()));db.close(); }
});

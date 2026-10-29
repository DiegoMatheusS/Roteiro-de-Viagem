import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {viewportPlaceRows} from '../server/maps';

const bounds={south:-23.56,north:-23.54,west:-46.64,east:-46.62};

test('the public camera endpoint returns all registered categories in view, including more than 150 places',async()=>{
  const db=openDatabase(':memory:');let externalCalls=0;
  const insert=db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,active,managed) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const add=(id:string,lat:number,lng:number,kind='park',active=1,managed=1)=>insert.run(id,id,lat,lng,'Endereço confirmado','https://www.openstreetmap.org/',new Date().toISOString(),kind,active,managed);
  for(let i=0;i<220;i++)add('registered:'+i,-23.55,-46.63+i*.00001,['park','shopping','restaurant','supermarket','waterfall'][i%5]);
  for(let i=0;i<1100;i++)add('old-route:'+i,-24.5,-47.5);
  add('inactive',-23.55,-46.63,'park',0);add('fuel',-23.55,-46.63,'fuel');
  add('outside',-23.57,-46.63);add('imported',-23.55,-46.63,'park',1,0);
  const server=createApi({db,mapFetch:async()=>{externalCalls++;throw new Error('No provider should be used');}}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+(server.address() as any).port+'/api/places/search';
  const search=async(body:unknown)=>{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,data:await response.json() as any};
  };
  try{
    const query={points:[[-23.55,-46.63]],radiusKm:2,bounds};
    const first=await search(query);assert.equal(first.status,200);
    assert.equal(first.data.places.length,221);
    assert.equal(first.data.places.filter((place:any)=>place.managed).length,220);
    assert.ok(first.data.places.every((place:any)=>place.id.startsWith('registered:')||place.id==='imported'));
    const fuelVisible=await search({...query,includeFuel:true});
    assert.ok(fuelVisible.data.places.some((place:any)=>place.id==='fuel'&&place.managed));
    add('new-live',-23.55,-46.63,'cafe');
    db.prepare('UPDATE stations SET active=0 WHERE id=?').run('registered:0');
    const fresh=await search(query);
    assert.ok(fresh.data.places.some((place:any)=>place.id==='new-live'));
    assert.ok(!fresh.data.places.some((place:any)=>place.id==='registered:0'));
    assert.equal(externalCalls,0);
    for(const invalid of [null,{...bounds,north:NaN},{...bounds,south:bounds.north},
      {...bounds,east:200},{...bounds,north:40},{south:0,north:1,west:-179,east:179}])
      assert.equal((await search({...query,bounds:invalid})).status,400);
    assert.equal((await search({...query,points:[[-23,-46],[-24,-47]]})).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

test('camera bounds cross the date line without including unrelated world regions',()=>{
  const db=openDatabase(':memory:');
  try{
    const insert=db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,active,managed) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for(const [id,lng] of [['east',179.5],['west',-179.5],['middle',0]] as const)
      insert.run(id,id,0,lng,'Address','https://www.openstreetmap.org/',new Date().toISOString(),'park',1,1);
    assert.deepEqual(viewportPlaceRows(db,{south:-1,north:1,west:179,east:-179}).map(row=>row.id).sort(),['east','west']);
  }finally{db.close();}
});

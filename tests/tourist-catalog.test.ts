import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db';
import {importTourismRegion,parseTouristOsm,touristOverpassQuery,TOURISM_REGIONS} from '../server/touristCatalog';

const sample=[
 {type:'node',id:201,lat:-23.55,lon:-46.63,tags:{name:'Museu confirmado no mapa',tourism:'museum'}},
 {type:'node',id:202,lat:-23.551,lon:-46.635,tags:{name:'Teatro confirmado no mapa',amenity:'theatre'}},
 {type:'node',id:203,lat:-23.552,lon:-46.639,tags:{name:'Parque confirmado no mapa',leisure:'park'}},
 {type:'way',id:204,center:{lat:-23.555,lon:-46.64},tags:{name:'Estrada cênica verificada',highway:'tertiary',scenic:'yes'}},
 {type:'node',id:205,lat:-23.56,lon:-46.64,tags:{name:'Cachoeira verificada',waterway:'waterfall'}},
 {type:'way',id:206,center:{lat:-23.555,lon:-46.64},tags:{name:'Caminho a pé',highway:'footway',scenic:'yes'}},
 {type:'node',id:207,lat:-23.551,lon:-46.631,tags:{name:'Residência privada',tourism:'attraction',access:'private'}},
 {type:'node',id:208,lat:180,lon:181,tags:{name:'Inválido',tourism:'museum'}},
 {type:'node',id:209,lat:-23.552,lon:-46.63,tags:{tourism:'museum'}}
];
test('map taxonomy imports parks, museums, theatres and driveable scenic roads without false POIs',()=>{
 assert.equal(parseTouristOsm(sample[1])?.kind,'theatre');
 assert.equal(parseTouristOsm(sample[3])?.kind,'scenic_road');
 for(const blocked of sample.slice(5))assert.equal(parseTouristOsm(blocked),null);
 assert.match(touristOverpassQuery([-23.55,-46.63],35),/amenity"="theatre/);
 assert.ok(Object.keys(TOURISM_REGIONS).length>=27);
 assert.throws(()=>touristOverpassQuery([-23.55,-46.63],100));
});
test('OSM regional import is idempotent, protects admin/disabled records and reuses existing tables',async()=>{
 const db=openDatabase(':memory:');
 const calls:string[]=[];
 const fetcher=(async (url:string,options:RequestInit)=>{
   calls.push(String(url));
   assert.equal(options.method,'POST');
   return new Response(JSON.stringify({elements:sample}),{status:200});
 }) as typeof fetch;
 try{
   const args={coords:[-23.55,-46.63] as [number,number],radiusKm:35,fetcher};
   const first=await importTourismRegion(db,args);
   assert.deepEqual({inserted:first.inserted,valid:first.valid},{inserted:5,valid:5});
   assert.equal((db.prepare('SELECT COUNT(*) AS count FROM locations').get() as any).count,5);
   assert.equal((db.prepare('SELECT kind FROM stations WHERE id=?').get('osm:node:202') as any).kind,'theatre');
   assert.equal((db.prepare('SELECT source_url FROM stations WHERE id=?').get('osm:way:204') as any).source_url,'https://www.openstreetmap.org/way/204');
   db.prepare('UPDATE stations SET managed=1,name=? WHERE id=?').run('Nome do administrador','osm:node:201');
   db.prepare('UPDATE stations SET active=0 WHERE id=?').run('osm:node:202');
   const second=await importTourismRegion(db,args);
   assert.equal(second.inserted,0);
   assert.equal(second.unchanged,2);
   assert.equal((db.prepare('SELECT name FROM stations WHERE id=?').get('osm:node:201') as any).name,'Nome do administrador');
   assert.equal((db.prepare('SELECT active FROM stations WHERE id=?').get('osm:node:202') as any).active,0);
   assert.equal(calls.length,2);
 }finally{db.close();}
});
test('provider outage does not delete existing records',async()=>{
 const db=openDatabase(':memory:');
 try{
   await assert.rejects(importTourismRegion(db,{coords:[-23.55,-46.63],radiusKm:20,
     fetcher:(async()=>new Response('unavailable',{status:503})) as typeof fetch}),/indisponível/);
   assert.equal((db.prepare('SELECT COUNT(*) AS count FROM stations').get() as any).count,0);
 }finally{db.close();}
});

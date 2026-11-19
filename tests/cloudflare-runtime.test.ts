import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {PNG} from 'pngjs';
import {durableSqlite,type SqliteObjectStorage} from '../cloudflare/sqlite';
import {runTransaction} from '../server/database';
import {initializeDatabase} from '../server/schema';
import {bootstrapInitialAdmin} from '../server/bootstrap-admin';
import {edgeTrafficRedOnlyPng,sanitizeEdgePhoto,stripJpegMetadata,type PhotoImagesBinding} from '../cloudflare/images';
import {trafficRedOnlyPng} from '../server/traffic';

function storage(){
  const native=new DatabaseSync(':memory:');
  const raw=(value:unknown)=>value instanceof ArrayBuffer?Buffer.from(value):value;
  const edge=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,ArrayBuffer.isView(v)?Uint8Array.from(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).buffer:v]));
  const result:SqliteObjectStorage={
    sql:{exec(query,...values){
      assert.doesNotMatch(query.trim(),/^(BEGIN|COMMIT|ROLLBACK)\b/i,'transações explícitas não passam pelo cursor Cloudflare');
      if(!values.length&&query.includes(';')){native.exec(query);return {toArray:()=>[]};}
      const rows=native.prepare(query).all(...values.map(raw) as any[]).map(edge);
      return {toArray:()=>rows};
    }},
    transactionSync(callback){native.exec('BEGIN IMMEDIATE');try{const result=callback();native.exec('COMMIT');return result;}catch(error){native.exec('ROLLBACK');throw error;}},
  };
  return {native,db:durableSqlite(result)};
}

test('Cloudflare SQL initializes the complete schema, preserves binary data and really rolls back',()=>{
  const {db,native}=storage();
  try{
    initializeDatabase(db);
    const hash='0'.repeat(32)+':'+ '1'.repeat(128);
    assert.equal(bootstrapInitialAdmin(db,{email:'owner@example.invalid',passwordHash:hash}),'created');
    assert.equal(bootstrapInitialAdmin(db,{email:'owner@example.invalid',passwordHash:hash}),'already-configured');
    const owner=db.prepare('SELECT id FROM users').get() as {id:string};
    db.prepare("INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at) VALUES('x','Posto',-23,-46,'','https://www.openstreetmap.org/node/1','2026-11-19')").run();
    const photo=Buffer.from([0,1,2,255,128,0]);
    db.prepare("INSERT INTO photos(id,station_id,user_id,filename,status,created_at,image_data) VALUES('p','x',?,'p.jpg','pending','2026-11-19',?)").run(owner.id,photo);
    assert.deepEqual((db.prepare('SELECT image_data FROM photos').get() as any).image_data,photo);
    assert.throws(()=>runTransaction(db,()=>{
      db.prepare("INSERT INTO user_saved_locations(user_id,location_id,name,lat,lng,saved_at) VALUES(?,'saved','Lugar',-23,-46,'2026-11-19')").run(owner.id);
      db.prepare("INSERT INTO sessions VALUES('session',?,'2099-01-01')").run('missing-owner');
    }));
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM user_saved_locations').get() as any).count,0);
    assert.equal((db.prepare('DELETE FROM photos WHERE id=?').run('p')).changes,1);
    assert.equal((db.prepare('DELETE FROM photos WHERE id=?').run('p')).changes,0);
    assert.throws(()=>runTransaction(db,()=>Promise.resolve()),/síncrona/);
  }finally{native.close();}
});

test('Worker traffic preserves the exact Node pixel classification and existing opacity',async()=>{
  const image=new PNG({width:256,height:256});
  let seed=17;
  for(let i=0;i<image.data.length;i++){seed=(seed*1664525+1013904223)>>>0;image.data[i]=seed>>>24;}
  const source=PNG.sync.write(image);
  const node=PNG.sync.read(await trafficRedOnlyPng(source));
  const worker=PNG.sync.read(await edgeTrafficRedOnlyPng(source));
  assert.deepEqual(worker.data,node.data);
  await assert.rejects(edgeTrafficRedOnlyPng(PNG.sync.write(new PNG({width:128,height:256}))));
});

test('edge JPEG sanitization removes private metadata without touching decoded pixels',async()=>{
  const source=await sharp({create:{width:31,height:19,channels:3,background:'#7f9f32'}}).jpeg().withMetadata({exif:{IFD0:{Artist:'private-owner',ImageDescription:'private-gps-note'}}}).toBuffer();
  const cleaned=stripJpegMetadata(source),metadata=await sharp(cleaned).metadata();
  assert.equal(metadata.exif,undefined);assert.equal(cleaned.includes(Buffer.from('private-owner')),false);
  assert.deepEqual(await sharp(source).raw().toBuffer(),await sharp(cleaned).raw().toBuffer());
  const calls:unknown[]=[];
  const binding={
    info:async()=>({format:'image/jpeg',width:31,height:19}),
    input(){return {transform(options:unknown){calls.push(options);return {output:async(options:unknown)=>{
      calls.push(options);return {image:()=>new ReadableStream({start(controller){controller.enqueue(source);controller.close();}})};
    }};}};},
  } as unknown as PhotoImagesBinding;
  assert.deepEqual(await sanitizeEdgePhoto(binding,source),cleaned);
  assert.deepEqual(calls,[{width:1600,height:1600,fit:'scale-down',background:'#ffffff'},{format:'image/jpeg',quality:80,anim:false}]);
  binding.info=async()=>({format:'image/svg+xml'});
  await assert.rejects(sanitizeEdgePhoto(binding,source));
  binding.info=async()=>({format:'image/jpeg',width:6000,height:6000});
  await assert.rejects(sanitizeEdgePhoto(binding,source));
  binding.info=async()=>({format:'image/webp',width:31,height:19});
  const animatedWebp=Buffer.from('RIFF0000WEBPANIM0000','ascii');
  await assert.rejects(sanitizeEdgePhoto(binding,animatedWebp));
});

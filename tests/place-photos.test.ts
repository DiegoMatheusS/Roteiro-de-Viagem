import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {createPlacePhotoLoader} from '../server/placePhotos';

const seed=(db:ReturnType<typeof openDatabase>,id:string,node:number)=>db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind,managed) VALUES(?,?,0,0,'',?,'2026-11-06','park',1)`)
  .run(id,id,`https://www.openstreetmap.org/node/${node}`);
const image=(title:string,artist='Fotógrafo',license='CC BY-SA 4.0')=>({title:`File:${title}`,imageinfo:[{
  mime:'image/jpeg',thumburl:`https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/${title}/400px-${title}`,
  extmetadata:{Artist:{value:`<a href="https://example.com">${artist}</a>`},LicenseShortName:{value:license},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}
}]});
test('real place links resolve batched attributed photos; cache survives loader recreation and edits invalidate it',async()=>{
  const db=openDatabase(':memory:');
  try{
    for(let i=1;i<=4;i++)seed(db,`place-${i}`,i);
    const calls:string[]=[];
    const mapFetch=(async(input:any,init?:RequestInit)=>{
      const url=new URL(String(input));calls.push(url.hostname);
      if(url.hostname==='overpass-api.de'){
        assert.match(String(init?.body),/node%281%29/);
        return Response.json({elements:[
          {type:'node',id:1,tags:{wikimedia_commons:'File:Park.jpg'}},
          {type:'node',id:2,tags:{wikidata:'Q2'}},
          {type:'node',id:3,tags:{wikipedia:'pt:Hotel do teste'}},
          {type:'node',id:4,tags:{'brand:wikidata':'Q999',image:'https://private.example/internal.jpg'}}]});
      }
      if(url.hostname==='pt.wikipedia.org')return Response.json({query:{redirects:[{from:'Hotel do teste',to:'Hotel local'}],pages:[{title:'Hotel local',pageprops:{wikibase_item:'Q3'}}]}});
      if(url.hostname==='www.wikidata.org')return Response.json({entities:Object.fromEntries(['Q2','Q3'].map((id,i)=>[id,{claims:{P18:[{rank:'normal',mainsnak:{datavalue:{value:i?'Hotel.jpg':'Cafe.jpg'}}}]}}]))});
      assert.equal(url.hostname,'commons.wikimedia.org');
      assert.equal(url.searchParams.get('titles'),'File:Park.jpg|File:Cafe.jpg|File:Hotel.jpg');
      return Response.json({query:{pages:['Park.jpg','Cafe.jpg','Hotel.jpg'].map(name=>image(name,'Fotógrafo',name==='Park.jpg'?'CC0':'CC BY-SA 4.0'))}});
    }) as typeof fetch;
    const ids=['place-1','place-2','place-3','place-4','unknown','http://127.0.0.1'];
    const load=createPlacePhotoLoader(db,mapFetch);
    const [first,duplicate]=await Promise.all([load(ids),load(ids)]);
    assert.deepEqual(first,duplicate);assert.equal(calls.length,4,'concurrent batches reuse the persisted cache');
    assert.ok(first['place-1']?.photo.endsWith('400px-Park.jpg'));
    assert.equal(first['place-1']?.photoCredit,'Fotógrafo · CC0');
    assert.equal(first['place-2']?.photoCredit,'Fotógrafo · CC BY-SA 4.0');
    assert.ok(first['place-3']?.photo.endsWith('400px-Hotel.jpg'));
    assert.equal(first['place-4'],null,'a chain logo or arbitrary image is not a photo of the location');
    assert.equal(first.unknown,null);assert.equal(first['http://127.0.0.1'],null);
    assert.deepEqual(await createPlacePhotoLoader(db,mapFetch)(ids),first);assert.equal(calls.length,4);
    db.prepare("UPDATE stations SET active=0 WHERE id='place-1'").run();
    assert.equal((await load(['place-1']))['place-1'],null,'an inactive location cannot revive cached imagery');
    db.prepare("UPDATE stations SET source_url='' WHERE id='place-2'").run();
    assert.equal((await load(['place-2']))['place-2'],null,'editing the source invalidates its earlier association');
  }finally{db.close();}
});
test('missing credits, unsupported image licenses and failed providers keep the real category fallback',async()=>{
  const db=openDatabase(':memory:');
  try{
    seed(db,'unlicensed',1);seed(db,'uncredited',2);seed(db,'down',3);
    const mocked=(async(input:any)=>new URL(String(input)).hostname==='overpass-api.de'
      ?Response.json({elements:[{type:'node',id:1,tags:{wikimedia_commons:'File:Rights.jpg'}},{type:'node',id:2,tags:{wikimedia_commons:'File:Unknown.jpg'}}]})
      :Response.json({query:{pages:[image('Rights.jpg','Someone','All rights reserved'),image('Unknown.jpg','')]}})) as typeof fetch;
    assert.deepEqual(await createPlacePhotoLoader(db,mocked)(['unlicensed','uncredited']),{unlicensed:null,uncredited:null});
    const failure=(async()=>{throw Error('offline');}) as typeof fetch;
    assert.deepEqual(await createPlacePhotoLoader(db,failure)(['down']),{down:null});
  }finally{db.close();}
});
test('photo metadata endpoint is public, validates batches and does not perform arbitrary lookups',async()=>{
  const db=openDatabase(':memory:');let calls=0;
  const app=createApi({db,mapFetch:(async()=>{calls++;throw Error('Unexpected lookup');}) as typeof fetch}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>app.once('listening',resolve));
  const post=(ids:unknown)=>fetch(`http://127.0.0.1:${(app.address() as any).port}/api/places/photos`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
  try{
    const response=await post(['unregistered']);assert.equal(response.status,200);assert.deepEqual(await response.json(),{photos:{unregistered:null}});
    assert.equal((await post(Array(21).fill('bad'))).status,400);assert.equal((await post([{}])).status,400);assert.equal(calls,0);
  }finally{await new Promise<void>(resolve=>app.close(()=>resolve()));db.close();}
});

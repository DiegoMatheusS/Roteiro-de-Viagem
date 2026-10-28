import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createTrafficService} from '../server/traffic';
import {createApi} from '../server/app';
import {openDatabase} from '../server/db';

const key='traffic-test-only-not-a-real-key';
const png=()=>sharp({create:{width:256,height:256,channels:4,background:'#2ae57b'}}).png().toBuffer();
test('traffic proxies real provider PNG unchanged, authenticates by header, coalesces and expires cache',async()=>{
  const image=await png();let calls=0,now=1800000000000;
  const service=createTrafficService({key:()=>key,clock:()=>now,fetcher:async(url,options)=>{
    calls++;assert.equal(new URL(String(url)).hostname,'api.tomtom.com');
    assert.match(String(url),/\/maps\/orbis\/traffic\/flow\/raster\/tile\/12\/2044\/1360\?apiVersion=2&style=light&tileSize=256$/);
    assert.ok(!String(url).includes(key));assert.equal(new Headers(options?.headers).get('TomTom-Api-Key'),key);
    assert.equal(options?.redirect,'error');assert.ok(options?.signal);
    return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/png','Cache-Control':'max-age=60'}});
  }});
  const [one,two]=await Promise.all([service.getTile('light','12','2044','1360'),service.getTile('light','12','2044','1360')]);
  assert.equal(calls,1);assert.deepEqual(one.data,image);assert.equal(one,two);
  now+=59000;await service.getTile('light','12','2044','1360');assert.equal(calls,1);
  now+=1001;await service.getTile('light','12','2044','1360');assert.equal(calls,2);
});
test('missing key and invalid grids never call the traffic provider',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw new Error('unexpected');};
  const absent=createTrafficService({key:()=>'',fetcher});assert.equal(absent.enabled(),false);
  await assert.rejects(absent.getTile('light','0','0','0'),/indisponível/);
  const configured=createTrafficService({key:()=>key,fetcher});
  for(const args of [['evil','0','0','0'],['light','23','0','0'],['light','2','4','0'],['light','2','0','-1'],['light','01','0','0'],['light','2','1e1','0']])
    await assert.rejects(configured.getTile(...args as [string,string,string,string]),/inválido/);
  assert.equal(calls,0);
});
test('bad keys, quota, malformed or oversized responses close the overlay without leaking upstream errors',async()=>{
  const oversized=new Uint8Array(512*1024+1);
  for(const response of [new Response(key,{status:403}),new Response(key,{status:429}),
    new Response(key,{headers:{'Content-Type':'image/png'}}),
    new Response(oversized,{headers:{'Content-Type':'image/png'}})]){
    let calls=0,now=1800000000000;
    const service=createTrafficService({key:()=>key,clock:()=>now,fetcher:async()=>{calls++;return response;}});
    await assert.rejects(service.getTile('dark','10','100','100'),error=>{
      assert.equal((error as any).status,503);assert.ok(!(error as Error).message.includes(key));return true;
    });
    assert.equal(service.enabled(),false);
    await assert.rejects(service.getTile('dark','10','101','100'));assert.equal(calls,1,'outage backs off across tiles');
    now+=60001;assert.equal(service.enabled(),true);
  }
});
test('traffic HTTP tiles have CORS and their own quota; no key is exposed through status or errors',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'role-traffic-')),db=openDatabase(path.join(directory,'test.sqlite'));
  const image=await png();let calls=0;
  const app=createApi({db,photoDirectory:path.join(directory,'photos'),requestLimitPerMinute:2,
    traffic:{key:()=>key,fetcher:async()=>{calls++;return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/png'}});}}});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  try{
    const status=await (await fetch(base+'/traffic/status')).json();
    assert.equal(status.available,true);assert.equal(status.routeTimesIncludeTraffic,false);
    assert.match(status.tileUrl,/\/api\/traffic\/tiles\/\{style\}\/\{z\}\/\{x\}\/\{y\}\.png$/);
    assert.ok(!JSON.stringify(status).includes(key));
    for(let i=0;i<190;i++){
      const tile=await fetch(base+'/traffic/tiles/light/12/2044/1360.png');
      assert.equal(tile.status,200);assert.equal(tile.headers.get('access-control-allow-origin'),'*');
      assert.equal(tile.headers.get('content-type'),'image/png');
      assert.match(tile.headers.get('cache-control')!,/max-age=\d+, must-revalidate/);
      assert.deepEqual(Buffer.from(await tile.arrayBuffer()),image);
    }
    assert.equal(calls,1);assert.equal((await fetch(base+'/health')).status,200,'tile requests cannot exhaust ordinary API quota');
    assert.equal((await fetch(base+'/traffic/tiles/light/2/4/0.png')).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();fs.rmSync(directory,{recursive:true,force:true});}
});

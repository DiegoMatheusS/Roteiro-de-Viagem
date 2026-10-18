import test from 'node:test';
import assert from 'node:assert/strict';
import publicWorker from '../public/_worker.js';
import adminWorker from '../admin-worker.js';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';

const blockedFrame = (headers:Headers) => {
  assert.equal(headers.get('x-frame-options'),'DENY');
  assert.equal(headers.get('x-content-type-options'),'nosniff');
  assert.match(headers.get('content-security-policy')||'',/frame-ancestors 'none'/);
  assert.match(headers.get('content-security-policy')||'',/object-src 'none'/);
};

test('public and separate admin HTML assets cannot be framed or serve objects',async()=>{
  for(const site of [publicWorker,adminWorker]){
    const response=await site.fetch(new Request('https://safe.example/'),{
      ASSETS:{fetch:async()=>new Response('<h1>Site</h1>',{headers:{'Content-Type':'text/html'}})}
    });
    assert.equal(response.status,200);
    blockedFrame(response.headers);
  }
});

test('blocked API writes also return protective headers',async()=>{
  for(const site of [publicWorker,adminWorker]){
    const response=await site.fetch(new Request('https://safe.example/api/health',{
      method:'POST',headers:{Origin:'https://other.example'}
    }),{});
    assert.equal(response.status,403);
    blockedFrame(response.headers);
  }
});

test('Railway API sends security headers even before authentication',async()=>{
  const db=openDatabase(':memory:');const server=createApi({db}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
    const response=await fetch('http://127.0.0.1:'+((server.address() as any).port)+'/api/health');
    assert.equal(response.status,200);
    blockedFrame(response.headers);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

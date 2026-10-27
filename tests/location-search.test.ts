import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLocations} from '../src/services/locationSearch';

test('address search preserves accented query and bias, and rejects invalid coordinates',async t=>{
  let requested='';
  t.mock.method(globalThis,'fetch',async(input:string)=>{
    requested=input;
    return new Response(JSON.stringify({results:[
      {id:'valid',name:'Rua São João',coords:[-23.55,-46.63]},
      {id:'invalid',name:'Coordenada inválida',coords:[91,0]},
      {id:'missing',name:'Sem coordenadas'}
    ]}));
  });
  const result=await searchLocations('  Rua São João  ',[-23.55,-46.63]);
  const query=new URL(requested,'https://app.test').searchParams;
  assert.equal(query.get('q'),'Rua São João');assert.equal(query.get('lat'),'-23.55');assert.equal(query.get('lng'),'-46.63');
  assert.deepEqual(result.results.map(place=>place.id),['valid']);
});

test('an unresponsive search times out, aborts HTTP, and permits a later retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let signal:AbortSignal|undefined;
  const fetch=t.mock.method(globalThis,'fetch',(_input:string,init:RequestInit)=>{
    signal=init.signal??undefined;
    return new Promise<Response>(()=>{});
  });
  const pending=searchLocations('Rua de teste');
  const rejected=assert.rejects(pending,/demorou para responder/);
  t.mock.timers.tick(20_000);await rejected;
  assert.equal(signal?.aborted,true);
  fetch.mock.mockImplementation(async()=>new Response(JSON.stringify({results:[]})));
  assert.deepEqual((await searchLocations('Rua de teste')).results,[]);
});

test('cancelling an old query ignores its late successful response',async t=>{
  let resolve!:(value:Response)=>void;
  t.mock.method(globalThis,'fetch',()=>new Promise<Response>(done=>{resolve=done;}));
  const controller=new AbortController();
  const pending=searchLocations('Endereço anterior',undefined,controller.signal);
  const rejected=assert.rejects(pending,/Busca cancelada/);
  controller.abort();await rejected;
  resolve(new Response(JSON.stringify({results:[{id:'old',name:'Endereço anterior',coords:[1,1]}]})));
  await Promise.resolve();
});

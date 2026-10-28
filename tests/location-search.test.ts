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

test('search never chooses another house number or the street centroid',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({results:[
    {id:'street',name:'Rua das Flores',address:'Rua das Flores, São Paulo',coords:[-23.55,-46.63]},
    {id:'other',name:'Rua das Flores, 10',address:'Rua das Flores, 10, São Paulo',coords:[-23.55,-46.63]},
    {id:'exact',name:'Rua das Flores, 100',address:'Rua das Flores, 100, São Paulo',coords:[-23.56,-46.64]}
  ]}));
  const found=await searchLocations('Rua das Flores, 100, São Paulo',[-23.55,-46.63]);
  assert.deepEqual(found.results.map(p=>p.id),['exact']);
  assert.equal(found.unmatchedHouseNumber,null);
  const missing=await searchLocations('Rua das Flores 123, São Paulo',[-23.55,-46.63]);
  assert.deepEqual(missing.results,[]);
  assert.equal(missing.unmatchedHouseNumber,'123');
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

test('a busy provider is retried once after spacing; later queries can cancel the wait',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    calls++;
    return calls===1?Response.json({error:'Busca ocupada'},{status:429}):Response.json({results:[]});
  });
  const pending=searchLocations('Avenida Paulista');
  await new Promise(setImmediate);assert.equal(calls,1);
  t.mock.timers.tick(1200);assert.deepEqual((await pending).results,[]);assert.equal(calls,2);
});
test('replacing a busy suggestion cancels its retry without sending another request',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'Busca ocupada'},{status:429});});
  const controller=new AbortController(),pending=searchLocations('Endereço substituído',undefined,controller.signal);
  const rejected=assert.rejects(pending,/Busca cancelada/);
  await new Promise(setImmediate);controller.abort();await rejected;
  t.mock.timers.tick(1200);await Promise.resolve();assert.equal(calls,1);
});

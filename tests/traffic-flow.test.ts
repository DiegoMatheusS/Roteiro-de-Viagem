import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrafficFlowController,isTrafficMapError,TRAFFIC_MAX_CAMERA_RADIUS_KM,trafficViewportRadiusKm,type TrafficConfig,type TrafficMapPort,type TrafficState} from '../src/services/trafficFlow';

const config:TrafficConfig={available:true,tileUrl:'https://api.example.test/api/traffic/tiles/{style}/{z}/{x}/{y}.png',attribution:'© TomTom',refreshSeconds:60};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function surface(){
  let events!:Parameters<TrafficMapPort['listen']>[0];
  const state={zoom:18,radiusKm:2,moving:false,url:null as string|null,updates:[] as (string|null)[],states:[] as TrafficState[]};
  const port:TrafficMapPort={getZoom:()=>state.zoom,getViewportRadiusKm:()=>state.radiusKm,isMoving:()=>state.moving,
    setTiles:url=>{state.url=url;state.updates.push(url);},listen:callbacks=>{events=callbacks;return()=>{};}};
  return {state,port,get events(){return events;},onState:(value:TrafficState)=>state.states.push(value)};
}
test('traffic is live only after a tile loads; movement events do not repeat status or tile refreshes',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1800000000000});
  const map=surface();let calls=0;
  const control=createTrafficFlowController({...map,load:async()=>{calls++;return config;}});
  await flush();assert.equal(calls,1);assert.equal(map.state.states.at(-1),'loading');
  assert.match(map.state.url!,/\/light\/\{z\}\/\{x\}\/\{y\}\.png\?v=\d+/);
  map.events.loaded();assert.equal(map.state.states.at(-1),'live');
  const updates=map.state.updates.length;for(let i=0;i<100;i++)map.events.idle();
  assert.equal(calls,1);assert.equal(map.state.updates.length,updates);
  map.events.style();assert.equal(map.state.updates.length,updates+1,'new base style restores the traffic source');assert.equal(calls,1);
  control.destroy();assert.equal(map.state.url,null);
});
test('traffic refresh waits for pan/pinch to finish',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1800000000000});
  const map=surface();let calls=0;
  const control=createTrafficFlowController({...map,load:async()=>{calls++;return config;}});await flush();
  map.state.moving=true;t.mock.timers.tick(60000);await flush();assert.equal(calls,1);
  map.state.moving=false;map.events.idle();await flush();assert.equal(calls,2);
  control.destroy();
});
test('hiding, offline and disabled states remove traffic and stop all refreshes',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1800000000000});
  const map=surface(),doc=Object.assign(new EventTarget(),{hidden:false}),page=new EventTarget();let calls=0;
  const control=createTrafficFlowController({...map,doc,page,load:async()=>{calls++;return config;}});await flush();
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(map.state.url,null);
  t.mock.timers.tick(600000);await flush();assert.equal(calls,1);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(calls,2);
  control.setOffline(true);assert.equal(map.state.states.at(-1),'offline');assert.equal(map.state.url,null);
  t.mock.timers.tick(600000);await flush();assert.equal(calls,2);
  control.setOffline(false);await flush();assert.equal(calls,3);
  control.setEnabled(false);assert.equal(map.state.states.at(-1),'off');assert.equal(map.state.url,null);
  t.mock.timers.tick(600000);await flush();assert.equal(calls,3);
  control.destroy();doc.dispatchEvent(new Event('visibilitychange'));page.dispatchEvent(new Event('pageshow'));
  await flush();assert.equal(calls,3);
});
test('failed tiles remove stale colors and back off, without causing a base-map error',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1800000000000});
  const map=surface();let calls=0;
  const control=createTrafficFlowController({...map,load:async()=>{calls++;return config;}});await flush();map.events.loaded();
  map.events.error();assert.equal(map.state.states.at(-1),'unavailable');assert.equal(map.state.url,null);
  for(let i=0;i<20;i++)map.events.idle();assert.equal(calls,1);
  t.mock.timers.tick(60000);await flush();assert.equal(calls,2);
  assert.equal(isTrafficMapError({sourceId:'role-traffic-flow'}),true);
  assert.equal(isTrafficMapError({error:{message:'Failed https://api.test/api/traffic/tiles/light/1/0/0.png'}}),true);
  assert.equal(isTrafficMapError({sourceId:'openfreemap'}),false);
  control.destroy();
});
test('late API replies cannot restore colors after hiding or destroying a map',async()=>{
  const map=surface(),doc=Object.assign(new EventTarget(),{hidden:false});
  let resolve!:(config:TrafficConfig)=>void,signal!:AbortSignal;
  const control=createTrafficFlowController({...map,doc,load:abort=>{signal=abort;return new Promise(done=>{resolve=done;});}});
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(signal.aborted,true);
  resolve(config);await flush();assert.equal(map.state.url,null);assert.equal(map.state.states.at(-1),'paused');control.destroy();
});
test('missing provider configuration and low zoom never pretend to have live traffic',async()=>{
  const map=surface();map.state.zoom=4;let calls=0;
  const control=createTrafficFlowController({...map,load:async()=>{calls++;return {...config,available:false,tileUrl:null};}});
  assert.equal(map.state.states.at(-1),'zoom-in');assert.equal(calls,0);
  map.state.zoom=12;map.events.idle();await flush();assert.equal(calls,1);
  assert.equal(map.state.states.at(-1),'unavailable');assert.equal(map.state.url,null);control.destroy();
});

test('10 km viewport limit avoids requests and clears the existing overlay when zooming out',async()=>{
  const map=surface();let calls=0;
  const control=createTrafficFlowController({...map,load:async()=>{calls++;return config;}});
  await flush();assert.equal(calls,1);
  map.events.loaded();assert.equal(map.state.states.at(-1),'live');
  map.state.radiusKm=10.01;map.events.idle();
  assert.equal(map.state.url,null,'traffic overlay removed when camera exceeds the radius');
  assert.equal(map.state.states.at(-1),'zoom-in');
  assert.equal(calls,1);
  for(let i=0;i<20;i++)map.events.idle();assert.equal(calls,1);
  map.state.radiusKm=9.99;map.events.idle();await flush();
  assert.equal(calls,2,'fetch only after returning to a nearby camera view');
  control.destroy();
});
test('camera-to-corner radius is geodesic and bounded around the actual viewport',()=>{
  assert.equal(TRAFFIC_MAX_CAMERA_RADIUS_KM,10);
  assert.equal(trafficViewportRadiusKm([-23.55,-46.63],[-23.55,-46.63],[-23.55,-46.63]),0);
  const nearby=trafficViewportRadiusKm([-23.55,-46.63],[-23.58,-46.66],[-23.52,-46.6]);
  const distant=trafficViewportRadiusKm([-23.55,-46.63],[-23.75,-46.85],[-23.35,-46.41]);
  assert.ok(nearby>2&&nearby<10);
  assert.ok(distant>10);
  assert.equal(trafficViewportRadiusKm([NaN,0],[0,0],[0,0]),Infinity);
});

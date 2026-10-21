import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {TripPlan} from '../src/types';
import type {DeviceLocation} from '../src/services/locationService';
import {
  initialOffRouteState,evaluateOffRoute,distanceToRouteMeters,
  verifiedReroute,eligibleDirectReroute,
  REROUTE_COOLDOWN_MS
} from '../src/services/autoReroute';

type Point=[number,number];
const path:Point[]=[[-23.5,-46.5],[-23.5,-46.49]];
const now=1_740_000_000_000;
const fix=(age:number,coords:Point,extras:Partial<DeviceLocation>={}):DeviceLocation=>({
  coords,timestamp:now+age,accuracyMeters:9,speedMetersPerSecond:8,headingDegrees:85,...extras
});
const direct={
  id:'trip-test',routingSource:'OSRM',routePath:path,originCoords:path[0],
  destinationCoords:path[1],stops:[],waypointOrder:[...path],
  navigationReroute:undefined
} as unknown as TripPlan;
test('projeção usa segmentos, não vértices isolados de uma rota longa',()=>{
  const midpoint:Point=[-23.5,-46.495];
  assert.ok(distanceToRouteMeters(midpoint,path)<1);
  assert.ok(distanceToRouteMeters([-23.498,-46.495],path)>200);
  assert.equal(distanceToRouteMeters(midpoint,[]),Infinity);
  assert.equal(distanceToRouteMeters([NaN,0],path),Infinity);
});
test('recalcula somente após 3 posições boas e seis segundos longe da rua',()=>{
  let state=initialOffRouteState();
  const samples=[
    fix(0,[-23.4985,-46.4995]),
    fix(3200,[-23.4985,-46.4993]),
    fix(6500,[-23.4985,-46.4991])
  ];
  const hits=[];
  for(const sample of samples){
    const action=evaluateOffRoute(state,sample,path,sample.timestamp);
    state=action.state;hits.push(action.trigger);
  }
  assert.deepEqual(hits,[false,false,true]);
  assert.equal(state.lastAttemptAt,samples[2].timestamp);
  assert.equal(state.outsideCount,0);
  const next=evaluateOffRoute(state,fix(10500,[-23.4985,-46.4988]),path,now+10500);
  assert.equal(next.trigger,false,'Sem bombardeamento de solicitações após um recálculo');
});
test('sem rede não reenvia antes de 60 s e permite nova tentativa após confirmação',()=>{
 let state=initialOffRouteState();
 const positions=[0,3500,7000,10500,14000,18000,64000,67500,71000].map(
   (ms,i)=>fix(ms,[-23.4984,-46.4995+i*0.00026]));
 const hits:number[]=[];
 for(const gps of positions){
   const out=evaluateOffRoute(state,gps,path,gps.timestamp);
   state=out.state;
   if(out.trigger)hits.push(gps.timestamp);
 }
 assert.equal(REROUTE_COOLDOWN_MS,60000);
 assert.equal(hits.length,2);
 assert.ok(hits[1]-hits[0]>=REROUTE_COOLDOWN_MS);
});
test('um ruído, sinal velho, salto GPS e retorno ao traçado nunca iniciam outra rota',()=>{
 const run=(samples:DeviceLocation[])=>{
  let state=initialOffRouteState(),hits=0;
  for(const sample of samples){const decision=evaluateOffRoute(state,sample,path,sample.timestamp);
    state=decision.state;if(decision.trigger)hits++;}
  return hits;
 };
 assert.equal(run([
  fix(0,[-23.4985,-46.4998]),
  fix(4000,[-23.4985,-46.4996],{accuracyMeters:70}),
  fix(8000,[-23.4985,-46.4991]),
  fix(12000,[-23.5,-46.4988])
 ]),0);
 let state=initialOffRouteState();
 state=evaluateOffRoute(state,fix(0,[-23.4985,-46.4999]),path,now).state;
 const stale=evaluateOffRoute(state,fix(1000,[-23.4985,-46.4996]),path,now+9000);
 assert.equal(stale.trigger,false);
 assert.equal(stale.state.outsideCount,0);
 const jump=evaluateOffRoute(state,fix(1000,[-23.48,-46.49]),path,now+1000);
 assert.equal(jump.trigger,false);
 assert.equal(jump.state.outsideCount,0);
 assert.equal(run([
  fix(0,[-23.4985,-46.4999],{speedMetersPerSecond:0}),
  fix(3500,[-23.4985,-46.4998],{speedMetersPerSecond:0}),
  fix(7000,[-23.4985,-46.4996],{speedMetersPerSecond:0})
 ]),0);
});
test('roteiro com paradas ou ajuste manual não pode pular pontos obrigatórios',()=>{
 assert.equal(eligibleDirectReroute(direct),true);
 assert.equal(eligibleDirectReroute({...direct,waypointOrder:[path[0],[-23.51,-46.51],path[1]]}),false);
 assert.equal(eligibleDirectReroute({...direct,stops:[{id:'stop'}] as TripPlan['stops']}),false);
 assert.equal(eligibleDirectReroute({...direct,editedWaypoint:[-23.505,-46.495]}),false);
 assert.equal(eligibleDirectReroute({...direct,routingSource:undefined}),false);
});
test('somente OSRM verdadeiro substitui a rota sem zerar hodômetro acumulado',()=>{
 const origin:Point=[-23.4985,-46.4995];
 const route:[Point,Point,Point]=[origin,[-23.4985,-46.495],path[1]];
 const candidate={routePath:route,routeSteps:[{coords:origin,distanceFromStartKm:0,type:'depart',name:''}],
   distanceKm:2.12,drivingMinutes:6,durationMinutes:6,stale:false};
 const next=verifiedReroute(candidate,origin,path[1],31.5,new Date('2026-10-21T12:00:00Z'));
 assert.equal(next.trackedAtKm,31.5);
 assert.equal(next.distanceKm,2.12);
 assert.equal(next.updatedAt,'2026-10-21T12:00:00.000Z');
 assert.throws(()=>verifiedReroute({...candidate,stale:true},origin,path[1],31.5));
 assert.throws(()=>verifiedReroute({...candidate,routePath:[origin,[0,0],path[1]]},origin,path[1],31.5));
 assert.throws(()=>verifiedReroute({...candidate,routePath:[[0,0],path[1]]},origin,path[1],31.5));
 assert.throws(()=>verifiedReroute({...candidate,routePath:[origin,[0,0]]},origin,path[1],31.5));
 assert.throws(()=>verifiedReroute({...candidate,routeSteps:[]},origin,path[1],31.5));
});
test('navegação mantém rota restante e progresso relativo, não reseta distância acumulada',()=>{
 const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const hud=read('src/components/ActiveTripModal.tsx');
 const app=read('src/App.tsx');
 const hook=read('src/hooks/useAutoReroute.ts');
 const service=read('src/services/autoReroute.ts');
 assert.match(hud,/const navigationPath=rerouted\?\.routePath\|\|trip\.routePath/);
 assert.match(hud,/distanceTraveledKm-rerouted\.trackedAtKm/);
 assert.match(hud,/travelledDistanceKm=\{routeTravelledKm\} totalRouteKm=\{routeDistanceKm\}/);
 assert.match(hud,/nextNavigationGuidance\(navigationPath,navigationSteps/);
 assert.match(app,/storageService\.setActiveTrip\(updated\)/);
 assert.match(app,/onNavigationReroute=\{handleNavigationReroute\}/);
 assert.match(hook,/inflight\.current\?\.abort\(\)/);
 assert.match(hook,/if\(!live \|\| distanceBetweenKm\(live\.coords,next\.originCoords\)>\.35\)/);
 assert.match(service,/roundTrip:false/);
 assert.match(service,/\x27\/routes\/itinerary\x27/);
 assert.doesNotMatch(service,/https:\/\/router\.project-osrm\.org/);
});

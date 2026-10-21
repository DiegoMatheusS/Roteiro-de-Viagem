import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {TripPlan} from '../src/types';
import type {DeviceLocation} from '../src/services/locationService';
import {
  initialOffRouteState,evaluateOffRoute,distanceToRouteMeters,isGpsOutsideRouteCorridor,
  verifiedReroute,eligibleDirectReroute,eligibleAutomaticReroute,
  orderedRerouteStops,remainingRerouteStops,confirmStopArrival,initialStopArrivalState,
  requestAutomaticReroute,REROUTE_COOLDOWN_MS
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
 const positions=[0,3500,7000,10500,14000,18000,64000,67500,71000,74500].map(
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
 assert.equal(eligibleDirectReroute({...direct,isCircular:true}),false);
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

test('mapa não anuncia conversões antigas quando o GPS confiável sai do corredor',()=>{
 assert.equal(isGpsOutsideRouteCorridor(fix(0,[-23.5,-46.495]),path,now),false);
 assert.equal(isGpsOutsideRouteCorridor(fix(0,[-23.4985,-46.495]),path,now),true);
 assert.equal(isGpsOutsideRouteCorridor(fix(0,[-23.4985,-46.495],{accuracyMeters:80}),path,now),false);
 assert.equal(isGpsOutsideRouteCorridor(fix(0,[-23.4985,-46.495]),path,now+9000),false);
 const hud=readFileSync(new URL('../src/components/ActiveTripModal.tsx',import.meta.url),'utf8');
 assert.match(hud,/const outsideCorridor=isGpsActive&&isGpsOutsideRouteCorridor\(tracking\.position,navigationPath\)/);
 assert.match(hud,/const nextTurn = outsideCorridor\?null:nextNavigationGuidance/);
 assert.match(hud,/outsideCorridor\?'Fora da rota':'Na rota'/);
});

const planStops=[
 {id:'stop-a',location:{id:'catalog-a',name:'Posto A',coords:[-23.5,-46.498] as Point},stayMinutes:5},
 {id:'stop-b',location:{id:'catalog-b',name:'Parque B',coords:[-23.5,-46.494] as Point},stayMinutes:10}
];
const plan={...direct,
  manualStops:planStops,
  acceptedSuggestions:[],
  stops:planStops.map(stop=>({
    id:stop.id,name:stop.location.name,category:'posto' as const,
    lat:stop.location.coords[0],lng:stop.location.coords[1],
    description:'',recommendedMinutes:stop.stayMinutes
  })),
  waypointOrder:[path[0],planStops[0].location.coords,planStops[1].location.coords,path[1]],
  navigationVisitedStopIds:[]
};
test('viagem com paradas cadastradas passa a recalcular, sem descartar ou trocar a ordem',()=>{
 assert.equal(eligibleDirectReroute(plan),false);
 assert.equal(eligibleAutomaticReroute(plan),true);
 assert.deepEqual(orderedRerouteStops(plan)?.map(stop=>stop.id),['stop-a','stop-b']);
 assert.deepEqual(remainingRerouteStops(plan)?.map(stop=>stop.id),['stop-a','stop-b']);
 assert.deepEqual(remainingRerouteStops({...plan,navigationVisitedStopIds:['stop-a']})?.map(stop=>stop.id),['stop-b']);
 assert.equal(eligibleAutomaticReroute({...plan,isCircular:true}),false);
 assert.equal(eligibleAutomaticReroute({...plan,editedWaypoint:[-23.51,-46.51]}),false);
 assert.equal(eligibleAutomaticReroute({...plan,stops:plan.stops.slice(1)}),false);
 assert.equal(eligibleAutomaticReroute({...plan,manualStops:[{...planStops[0],location:{name:'Sem ID'}}]}),false);
 assert.equal(eligibleAutomaticReroute({...plan,waypointOrder:[path[0],path[1]]}),false);
 assert.equal(eligibleAutomaticReroute({...plan,stops:[{id:'unverified'}] as TripPlan['stops']}),false);
});
test('duas sugestões entre paradas preservam a ordem do itinerário',()=>{
 const suggestion={
  id:'suggest-a',location:{id:'catalog-c',name:'Mirante',coords:[-23.5,-46.496] as Point},
  stayMinutes:3,afterIndex:0
 };
 const withSuggestion={...plan,acceptedSuggestions:[suggestion],
   stops:[plan.stops[0],{...plan.stops[0],id:'suggest-a',name:'Mirante'},plan.stops[1]],
   waypointOrder:[path[0],planStops[0].location.coords,suggestion.location.coords,
    planStops[1].location.coords,path[1]]};
 assert.deepEqual(orderedRerouteStops(withSuggestion)?.map(s=>s.id),
  ['stop-a','suggest-a','stop-b']);
 assert.equal(eligibleAutomaticReroute(withSuggestion),true);
 assert.equal(orderedRerouteStops({...withSuggestion,acceptedSuggestions:[{...suggestion,afterIndex:8}]}),null);
});
test('chegada à próxima parada requer 3 leituras GPS, 4 s e boa precisão',()=>{
 let progress=initialStopArrivalState();
 let visited:string|null=null;
 for(const time of [0,2100,4500]){
  const result=confirmStopArrival(progress,plan,
    fix(time,planStops[0].location.coords,{accuracyMeters:7,speedMetersPerSecond:0}),now+time);
  progress=result.state;visited=result.visitedId;
 }
 assert.equal(visited,'stop-a');
 const after={...plan,navigationVisitedStopIds:['stop-a']};
 const next=confirmStopArrival(progress,after,
   fix(8500,planStops[1].location.coords,{speedMetersPerSecond:0}),now+8500);
 assert.equal(next.visitedId,null);
 assert.equal(next.state.candidateId,'stop-b');
 const poor=confirmStopArrival(next.state,after,
   fix(10000,planStops[1].location.coords,{accuracyMeters:90}),now+10000);
 assert.equal(poor.visitedId,null);
 assert.equal(poor.state.candidateId,null);
});
test('API só fornece novo trajeto quando devolve todas as paradas na ordem correta',async()=>{
 const originalFetch=globalThis.fetch;
 const origin:Point=[-23.5004,-46.5004];
 const expected=[origin,planStops[0].location.coords,planStops[1].location.coords,path[1]];
 const payloads:unknown[]=[];
 globalThis.fetch=async(input,init)=>{
  assert.equal(input,'/api/routes/itinerary');
  const body=JSON.parse(String(init?.body)) as {manualStops:{id:string;locationId:string}[]};
  payloads.push(body);
  const waypoints=body.manualStops.length===2?expected:
    [origin,planStops[1].location.coords,path[1]];
  return new Response(JSON.stringify({
    routePath:[origin,path[0],...waypoints.slice(1)],
    routeSteps:[{coords:origin,distanceFromStartKm:0,type:'depart',name:''}],
    distanceKm:1.98,drivingMinutes:6,durationMinutes:21,
    waypoints
  }),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  const updated=await requestAutomaticReroute(plan,origin,23.1);
  assert.deepEqual(updated.remainingStopIds,['stop-a','stop-b']);
  assert.equal(updated.trackedAtKm,23.1);
  assert.deepEqual((payloads[0] as any).manualStops.map((x:{id:string})=>x.id),['stop-a','stop-b']);
  assert.deepEqual((payloads[0] as any).manualStops.map((x:{locationId:string})=>x.locationId),['catalog-a','catalog-b']);
  const after=await requestAutomaticReroute({...plan,navigationVisitedStopIds:['stop-a']},origin,23.4);
  assert.deepEqual(after.remainingStopIds,['stop-b']);
  assert.deepEqual((payloads[1] as any).manualStops.map((x:{id:string})=>x.id),['stop-b']);
 }finally{globalThis.fetch=originalFetch;}
});
test('rota com parada ausente ou deslocada é rejeitada e a anterior é preservada',()=>{
 const origin:Point=[-23.5004,-46.5004];
 const stops=[origin,planStops[0].location.coords,planStops[1].location.coords,path[1]];
 const valid={
  routePath:[origin,path[0],planStops[0].location.coords,planStops[1].location.coords,path[1]],
  routeSteps:[{coords:origin,distanceFromStartKm:0,type:'depart',name:''}],
  distanceKm:2,drivingMinutes:7,durationMinutes:22,waypoints:stops
 };
 assert.doesNotThrow(()=>verifiedReroute(valid,origin,path[1],11,new Date(),stops));
 assert.throws(()=>verifiedReroute({...valid,waypoints:stops.slice(1)},origin,path[1],11,new Date(),stops));
 assert.throws(()=>verifiedReroute({...valid,waypoints:[origin,planStops[1].location.coords,planStops[0].location.coords,path[1]]},origin,path[1],11,new Date(),stops));
 assert.throws(()=>verifiedReroute({...valid,
  routePath:[origin,[-23.48,-46.495],path[1]]},origin,path[1],11,new Date(),stops));
});
test('chegada persistida e a próxima parada aparecem sem resetar a viagem',()=>{
 const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const app=read('src/App.tsx'),hud=read('src/components/ActiveTripModal.tsx');
 const hook=read('src/hooks/useAutoReroute.ts');
 assert.match(app,/navigationVisitedStopIds:\[\.\.\.\(running\.navigationVisitedStopIds\|\|\[\]\),stopId\]/);
 assert.match(app,/onStopVisited=\{handleNavigationStopVisited\}/);
 assert.match(hud,/const outstandingStops=trip\.stops\.filter/);
 assert.match(hud,/onStopVisited\}\);/);
 assert.match(hook,/confirmStopArrival\(stopArrival\.current,options\.trip,fix\)/);
 assert.match(hook,/plannedVisitKey/);
 assert.match(hook,/plannedRouteVersion/);
 assert.match(hud,/pendingStopMinutes/);
 assert.match(hud,/plannedStopMinutes/);
});

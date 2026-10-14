import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTravelerState } from '../src/services/stateMerge';
import { emptyTravelerSnapshot,storageService } from '../src/services/storageService';
import { cloudState } from '../src/services/cloudState';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { createRoadDraft } from '../src/services/touristCircuit';
import type { Vehicle } from '../src/types';
const vehicle:Vehicle={id:'bike',type:'motorcycle',brand:'Teste',model:'Moto',nickname:'Moto',year:2026,fuelType:'gasolina',tankCapacityLiters:17,maxPassengers:2,odometerKm:0,consumption:{referenceUrban:20,referenceHighway:25,referenceAverage:22,userConfigured:22,source:'teste',sourceDate:'2026'}};
const road:[number,number][]=[[0,0],[0,0.01],[0.01,0.01]];
const trip={...createRoadDraft({originName:'Origem',originCoords:road[0],destinationName:'Destino',destinationCoords:road.at(-1)!,vehicle,circular:false,limits:{mode:'destination'}}),id:'trip-a',title:'Viagem A',routePath:road,routingSource:'OSRM' as const};
const initial=()=>({...emptyTravelerSnapshot('owner','Viajante'),vehicles:[structuredClone(vehicle)],trips:[structuredClone(trip)],selectedVehicleId:'bike'});
test('independent profile fields and new trips from both devices merge without lost updates',()=>{
 const base=initial(),local=structuredClone(base),remote=structuredClone(base);local.profile.bio='Bio local';remote.profile.homeAddress='Casa';
 local.trips.push({...trip,id:'local'});remote.trips.push({...trip,id:'remote'});
 const result=mergeTravelerState(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.state.profile.bio,'Bio local');assert.equal(result.state.profile.homeAddress,'Casa');assert.deepEqual(new Set(result.state.trips.map(t=>t.id)),new Set(['trip-a','local','remote']));
});
test('a conflict choice affects only overlapping fields and preserves other changes from both devices',()=>{
 const base=initial(),local=structuredClone(base),remote=structuredClone(base);local.profile.bio='Local';remote.profile.bio='Servidor';local.vehicles.push({...vehicle,id:'new-bike'});remote.trips.push({...trip,id:'remote-trip'});
 assert.equal(mergeTravelerState(base,local,remote).conflicts.length,1);
 for(const preference of ['server','device'] as const){const result=mergeTravelerState(base,local,remote,preference);assert.equal(result.state.profile.bio,preference==='server'?'Servidor':'Local');assert.equal(result.state.vehicles.length,2);assert.equal(result.state.trips.length,2);}
});
test('deletions survive unrelated edits and delete-versus-edit needs a choice',()=>{
 const base=initial(),local=structuredClone(base),remote=structuredClone(base);local.vehicles=[];remote.profile.bio='Servidor';
 assert.equal(mergeTravelerState(base,local,remote).state.vehicles.length,0);assert.equal(mergeTravelerState(base,local,remote).state.selectedVehicleId,'');
 remote.vehicles[0].nickname='Outra moto';assert.equal(mergeTravelerState(base,local,remote).conflicts.length,1);assert.equal(mergeTravelerState(base,local,remote,'server').state.vehicles[0].nickname,'Outra moto');
});
test('different completed trip IDs count once each, with GPS and manual distance totals',()=>{
 const base=initial(),local=structuredClone(base),remote=structuredClone(base);base.trips.push({...trip,id:'trip-b'});local.trips=structuredClone(base.trips);remote.trips=structuredClone(base.trips);
 local.trips[0]={...trip,status:'completed',actualDistanceKm:10,actualTraveledVerifiedGps:true};remote.trips[1]={...trip,id:'trip-b',status:'completed',actualDistanceKm:20,actualTraveledVerifiedGps:false};
 local.profile.completedTripsCount=1;local.profile.verifiedGpsKm=10;remote.profile.completedTripsCount=1;remote.profile.manualKm=20;
 const merged=mergeTravelerState(base,local,remote);assert.equal(merged.conflicts.length,0);assert.equal(merged.state.profile.completedTripsCount,2);assert.equal(merged.state.profile.verifiedGpsKm,10);assert.equal(merged.state.profile.manualKm,20);
});
test('remote end stops an old GPS checkpoint, and a new trip does not inherit the old distance',()=>{
 const base=initial();base.trips[0]={...trip,status:'in_progress',trackingDeviceId:'device-a',trackedDistanceKm:5};base.activeTrip=structuredClone(base.trips[0]);
 const local=structuredClone(base),remote=structuredClone(base);local.activeTrip!.trackedDistanceKm=6;remote.trips[0]={...remote.trips[0],status:'cancelled'};remote.activeTrip=null;
 const ended=mergeTravelerState(base,local,remote);assert.equal(ended.conflicts.length,0);assert.equal(ended.state.activeTrip,null);
 const next={...trip,id:'new-trip',status:'in_progress' as const,trackedDistanceKm:0,trackingDeviceId:'device-b'};remote.trips.push(next);remote.activeTrip=next;
 const switched=mergeTravelerState(base,local,remote);assert.equal(switched.state.activeTrip?.id,'new-trip');assert.equal(switched.state.activeTrip?.trackedDistanceKm,0);
});
test('derived forecasts do not block profile edits and merge does not mutate inputs',()=>{
 const base=initial(),local=structuredClone(base),remote=structuredClone(base);local.trips[0].weatherUpdatedAt='2026-10-14T12:00:00Z';remote.trips[0].weatherUpdatedAt='2026-10-14T13:00:00Z';local.profile.bio='Local';
 const before=JSON.stringify([base,local,remote]);assert.equal(mergeTravelerState(base,local,remote).conflicts.length,0);assert.equal(JSON.stringify([base,local,remote]),before);
});
test('merging a vehicle-count edit with a tariff refresh recalculates the combined budget',()=>{
 const base=initial();base.trips[0]={...trip,distanceKm:220,peopleCount:2,foodCostPerPerson:10,fuelPricePerLiter:6,vehicleGroupType:'multi_vehicle',groupVehiclesCount:1};
 const local=structuredClone(base),remote=structuredClone(base);local.trips[0].groupVehiclesCount=2;remote.trips[0].tolls=[{id:'toll',name:'Pedágio',coords:[0,0.01],sourceUrl:'https://www.openstreetmap.org/node/1',passages:2,price:6.5,knownCost:13}];
 const result=mergeTravelerState(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.state.trips[0].knownTollsCost,26);assert.equal(result.state.trips[0].estimatedFuelCost,120);assert.equal(result.state.trips[0].totalEstimatedCost,166);
});
test('cloud client rebases 409, resolves only conflicts, preserves offline edits and hydrates remote changes',async t=>{
 const db=openDatabase(':memory:');const server=createApi({db}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const origin=`http://127.0.0.1:${(server.address() as any).port}`,realFetch=globalThis.fetch,values=new Map<string,string>();
 const savedWindow=globalThis.window,savedDocument=globalThis.document,savedStorage=globalThis.localStorage;
 Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});Object.defineProperty(globalThis,'document',{value:Object.assign(new EventTarget(),{hidden:false}),configurable:true});Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)},configurable:true});
 let offline=false,cookie='';const statuses:string[]=[];
 globalThis.fetch=(async(input:any,options:any)=>{if(offline)throw new TypeError('Sem conexão');return realFetch(origin+String(input),{...options,headers:{...options?.headers,Cookie:cookie}});}) as typeof fetch;
 const direct=async(method:string,state?:any)=>{const response=await realFetch(origin+'/api/me/state',{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:state?JSON.stringify(state):undefined});assert.equal(response.status,200);return await response.json() as any;};
 try{
  const registration=await realFetch(origin+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'sync@test.example',displayName:'Viajante',password:'test-password-long'})});const account=(await registration.json() as any).user;cookie=registration.headers.get('set-cookie')!.split(';')[0];
  const state=initial();state.profile.id=account.id;await direct('PUT',{state,revision:0});
  await cloudState.connect(account,s=>statuses.push(s));
  await t.test('two devices edit different fields',async()=>{
   storageService.saveProfile({...storageService.getProfile(),bio:'Bio deste aparelho'});
   const remote=await direct('GET');remote.state.vehicles[0].nickname='Moto do outro aparelho';await direct('PUT',{state:remote.state,revision:remote.revision});
   await cloudState.syncNow();const saved=await direct('GET');assert.equal(saved.state.profile.bio,'Bio deste aparelho');assert.equal(saved.state.vehicles[0].nickname,'Moto do outro aparelho');assert.equal(statuses.at(-1),'synced');
  });
  await t.test('only conflicting field is chosen',async()=>{
   storageService.saveProfile({...storageService.getProfile(),bio:'Minha versão'});storageService.saveTrip({...trip,id:'local-added'});
   const remote=await direct('GET');remote.state.profile.bio='Outra versão';remote.state.trips.push({...trip,id:'remote-added'});await direct('PUT',{state:remote.state,revision:remote.revision});
   await cloudState.syncNow();assert.equal(statuses.at(-1),'conflict');await cloudState.resolveConflict('server');const saved=await direct('GET');assert.equal(saved.state.profile.bio,'Outra versão');assert.ok(saved.state.trips.some((t:any)=>t.id==='local-added'));assert.ok(saved.state.trips.some((t:any)=>t.id==='remote-added'));assert.ok(values.get(`rdv_cloud_v1_${account.id}_conflict_backup`));
  });
  await t.test('offline reload keeps the cache and sends edits after reconnect',async()=>{
   cloudState.stop();offline=true;await cloudState.connect(account,s=>statuses.push(s));assert.equal(statuses.at(-1),'offline');storageService.saveProfile({...storageService.getProfile(),homeAddress:'Casa offline'});offline=false;await cloudState.retry();await cloudState.syncNow();assert.equal((await direct('GET')).state.profile.homeAddress,'Casa offline');
  });
  await t.test('remote profile changes arrive without page reload',async()=>{
   const remote=await direct('GET');remote.state.profile.name='Novo nome';await direct('PUT',{state:remote.state,revision:remote.revision});await cloudState.retry();assert.equal(storageService.getProfile().name,'Novo nome');const me=await realFetch(origin+'/api/auth/me',{headers:{Cookie:cookie}});assert.equal((await me.json() as any).user.displayName,'Novo nome');
  });
 }finally{cloudState.stop();globalThis.fetch=realFetch;Object.defineProperty(globalThis,'window',{value:savedWindow,configurable:true});Object.defineProperty(globalThis,'document',{value:savedDocument,configurable:true});Object.defineProperty(globalThis,'localStorage',{value:savedStorage,configurable:true});await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
test('convoy GPS binds to a device session, ignores delayed positions, preserves check-ins and versions route changes',async()=>{
 const db=openDatabase(':memory:');const server=createApi({db}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url=`http://127.0.0.1:${(server.address() as any).port}/api`;
 const call=async(path:string,body?:any,cookie?:string,method=body?'POST':'GET')=>{const res=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json() as any,cookie:res.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const owner=await call('/auth/register',{email:'convoy-owner@test.example',displayName:'Organizador',password:'test-password-long'}),rider=await call('/auth/register',{email:'convoy-rider@test.example',displayName:'Motociclista',password:'test-password-long'});
  const created=await call('/convoys',{trip,organizerUser:{vehicleType:'motorcycle'},meetingPoints:[{title:'Encontro',category:'posto',coords:road[0],street:'Rua do encontro',city:'Cidade'}]},owner.cookie);assert.equal(created.status,201);let group=created.body;
  await call('/convoys/join',{code:group.code,vehicleType:'motorcycle'},rider.cookie);
  const enabled=await call(`/convoys/${group.id}/location`,{enabled:true,deviceId:'phone-a'},rider.cookie,'PUT');const token=enabled.body.ownLocationToken;assert.ok(token);assert.equal((await call(`/convoys/${group.id}`,undefined,owner.cookie)).body.ownLocationToken,undefined);
  const position={enabled:true,coords:[0,0.009],timestamp:new Date().toISOString(),accuracyMeters:3,locationToken:token};assert.equal((await call(`/convoys/${group.id}/location`,position,rider.cookie,'PUT')).status,200);
  await call(`/convoys/${group.id}/location`,{...position,coords:[0,0.001],timestamp:new Date(Date.now()-30000).toISOString()},rider.cookie,'PUT');
  assert.deepEqual((await call(`/convoys/${group.id}`,undefined,owner.cookie)).body.participants.find((p:any)=>p.id===rider.body.user.id).coords,[0,0.009]);
  const takeover=await call(`/convoys/${group.id}/location`,{enabled:true,deviceId:'phone-b'},rider.cookie,'PUT');assert.notEqual(takeover.body.ownLocationToken,token);
  assert.equal((await call(`/convoys/${group.id}/location`,position,rider.cookie,'PUT')).status,409);assert.equal((await call(`/convoys/${group.id}/location`,{enabled:false,locationToken:token},rider.cookie,'PUT')).status,409);
  group=(await call(`/convoys/${group.id}`,undefined,owner.cookie)).body;const point=group.meetingPoints[0];assert.equal(point.street,'Rua do encontro');
  await call(`/convoys/${group.id}/check-in`,{meetingPointId:point.id,arrived:true},rider.cookie);await call(`/convoys/${group.id}/check-in`,{meetingPointId:point.id,arrived:true},rider.cookie);
  assert.equal((await call(`/convoys/${group.id}`,undefined,owner.cookie)).body.meetingPoints[0].confirmedArrivedParticipantIds.length,1);
  assert.equal((await call(`/convoys/${group.id}/route`,{trip:{...trip,title:'Atualizado'},routeRevision:group.routeRevision},rider.cookie,'PATCH')).status,403);
  const changed=await call(`/convoys/${group.id}/route`,{trip:{...trip,title:'Atualizado'},routeRevision:group.routeRevision},owner.cookie,'PATCH');assert.equal(changed.status,200);assert.equal(changed.body.meetingPoints[0].confirmedArrivedParticipantIds.length,1);
  assert.equal((await call(`/convoys/${group.id}/route`,{trip,routeRevision:group.routeRevision},owner.cookie,'PATCH')).status,409);
  assert.equal((await call(`/convoys/${group.id}/meeting-points/${point.id}`,{routeRevision:changed.body.routeRevision},rider.cookie,'DELETE')).status,403);
  assert.equal((await call(`/convoys/${group.id}/meeting-points/${point.id}`,{routeRevision:changed.body.routeRevision},owner.cookie,'DELETE')).status,200);
  await call(`/convoys/${group.id}/end`,{},owner.cookie);assert.equal((await call(`/convoys/${group.id}`,undefined,rider.cookie)).body.participants.every((p:any)=>!p.coords&&!p.isSharingLocation),true);
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});

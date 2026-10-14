import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { weatherCondition,weatherSamples } from '../server/weather';
import { weatherRequestForTrip,tollBudgetPatch } from '../src/services/routeConditions';
import { createRoadDraft } from '../src/services/touristCircuit';
import { getPlanningAlternatives } from '../src/services/routeCalculator';
import type { Vehicle } from '../src/types';
const vehicle:Vehicle={id:'test-car',type:'car',brand:'Teste',model:'Veículo do teste',nickname:'Carro',year:2026,fuelType:'gasolina',tankCapacityLiters:50,maxPassengers:5,odometerKm:0,consumption:{referenceUrban:10,referenceHighway:15,referenceAverage:12,userConfigured:12,source:'teste',sourceDate:'2026'}};
const path:[number,number][]=[[0,0],[0,0.01],[0,0.02],[0,0.01],[0,0]];
const trip={...createRoadDraft({originName:'Origem',originCoords:path[0],destinationName:'Origem',destinationCoords:path[4],vehicle,circular:true,limits:{mode:'destination'}}),routePath:path,distanceKm:4.448,durationMinutes:180,drivingMinutes:120,stops:[{id:'stop',name:'Parada',category:'endereco' as const,lat:0,lng:0.01,description:'',recommendedMinutes:60}]};
test('forecast passage time includes planned stays after arrival, not evenly diluted along the road',()=>{
  const start=Date.UTC(2026,9,14,9);
  const samples=weatherSamples(path,120,[{coords:[0,0.01],stayMinutes:60}],start);
  assert.equal(samples[0].passAt,start);
  assert.equal(samples[1].passAt,start+30*60000);
  assert.equal(samples[2].passAt,start+120*60000);
  assert.equal(samples.at(-1)!.passAt,start+180*60000);
});
test('snow, freezing rain and thunderstorms are not mislabeled as ordinary rain',()=>{
  assert.equal(weatherCondition(71),'Neve');assert.equal(weatherCondition(67),'Chuva Congelante');assert.equal(weatherCondition(95),'Trovoada');
});
test('a circular trip forecasts the remaining return stretch and drops visited stops',()=>{
  const request=weatherRequestForTrip({...trip,status:'in_progress',trackedDistanceKm:3.336},{coords:[0,0.01],timestamp:Date.now(),accuracyMeters:4,speedMetersPerSecond:10});
  assert.ok(request.drivingMinutes < 31 && request.drivingMinutes > 29);assert.equal(request.stops.length,0);
  assert.deepEqual(request.routePath.at(-1),[0,0]);assert.ok(request.routePath.length < path.length);
  const stale=weatherRequestForTrip({...trip,status:'in_progress',trackedDistanceKm:3.336},{coords:[0,0.01],timestamp:Date.now()-61000,accuracyMeters:4,speedMetersPerSecond:10});
  assert.deepEqual(stale.routePath,path);
});
test('updated approved tariffs recalculate the budget for all same-category vehicles',()=>{
  const patch=tollBudgetPatch({...trip,vehicleGroupType:'multi_vehicle',groupVehiclesCount:2,estimatedFuelCost:30,totalFoodCost:40,peopleCount:4,splitExpenses:true},{tolls:[],knownCost:13,status:'partial',mapUnavailable:false,updatedAt:new Date().toISOString(),warning:''});
  assert.equal(patch.knownTollsCost,26);assert.equal(patch.totalEstimatedCost,96);assert.equal(patch.costPerPerson,24);assert.equal(patch.tollsStatus,'partial');
});
test('reopening a group plan or changing vehicle count preserves the per-vehicle toll subtotal',()=>{
  const group={...trip,vehicleGroupType:'multi_vehicle' as const,groupVehiclesCount:2,knownTollsCost:26};
  const input={originName:trip.originName,originCoords:trip.originCoords,destinationName:trip.destinationName,destinationCoords:trip.destinationCoords,vehicle,peopleCount:4,vehicleGroupType:'multi_vehicle' as const,groupVehiclesCount:2,splitExpenses:true,foodCostPerPerson:10,fuelPricePerLiter:6,returnModality:trip.returnModality};
  assert.equal(getPlanningAlternatives(input,group)[0].tollsCost,26);
  assert.equal(getPlanningAlternatives({...input,groupVehiclesCount:3},group)[0].tollsCost,39);
  const single={...group,vehicleGroupType:'single_vehicle' as const,groupVehiclesCount:2,knownTollsCost:13};
  assert.equal(getPlanningAlternatives({...input,vehicleGroupType:'single_vehicle'},single)[0].tollsCost,13);
});
test('direction-specific tariffs, alias lane prices, contribution privacy and forecast cache',async t=>{
  const db=openDatabase(':memory:');let providerCalls=0;
  const mapFetch:typeof fetch=async()=>new Response(JSON.stringify({elements:[{type:'node',id:821,lat:0,lon:0.01,tags:{barrier:'toll_booth',name:'Praça de teste'}},{type:'node',id:822,lat:0.0001,lon:0.01,tags:{barrier:'toll_booth',name:'Outra faixa'}}]}));
  const weatherFetch:typeof fetch=async input=>{
    providerCalls++;const url=new URL(String(input));assert.equal(url.searchParams.get('wind_speed_unit'),'kmh');assert.equal(url.searchParams.get('temperature_unit'),'celsius');
    const times=Array.from({length:384},(_,i)=>new Date(Math.floor(Date.now()/3600000)*3600000+i*3600000).toISOString().slice(0,19));
    return new Response(JSON.stringify(url.searchParams.get('latitude')!.split(',').map(()=>({hourly:{time:times,temperature_2m:times.map(()=>23),precipitation_probability:times.map(()=>10),weather_code:times.map(()=>0),wind_speed_10m:times.map(()=>12)}}))));
  };
  const server=createApi({db,mapFetch,weatherFetch}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  const call=async(route:string,body?:any,cookie?:string)=>{const res=await fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json() as any,cookie:res.headers.get('set-cookie')?.split(';')[0]};};
  try{
    const author=await call('/auth/register',{email:'tariff-author@test.example',displayName:'Autor',password:'test-password-long'});
    const stranger=await call('/auth/register',{email:'tariff-stranger@test.example',displayName:'Outro',password:'test-password-long'});
    await call('/tolls/route',{routePath:path,vehicleType:'car'});
    const observed=new Date().toISOString(),validUntil=new Date(Date.now()+86400000).toISOString();
    const insert=db.prepare("INSERT INTO toll_entries(id,toll_id,user_id,vehicle_type,price,heading,observed_at,valid_until,status,created_at,reviewed_at) VALUES(?,?,?,'car',?,?,?,?, 'approved',?,?)");
    insert.run('east-price','osm:node:822',author.body.user.id,8,90,observed,validUntil,observed,observed);
    insert.run('west-price','osm:node:821',author.body.user.id,5,270,observed,validUntil,observed,observed);
    await t.test('retain a valid contribution on an alias lane and do not average unequal tariffs',async()=>{
      const read=await call('/tolls/route',{routePath:path,vehicleType:'car'});assert.equal(read.body.tolls.length,1);assert.equal(read.body.knownCost,13);
      assert.equal(read.body.tolls[0].price,null);assert.deepEqual(read.body.tolls[0].tariffs.map((x:any)=>x.price),[8,5]);assert.equal(read.body.tolls[0].knownCost,13);assert.equal(read.body.tolls[0].missingPassages,0);
    });
    await t.test('unknown return tariff does not erase an approved first passage or imply free travel',async()=>{
      db.prepare("UPDATE toll_entries SET valid_until=? WHERE id='west-price'").run(new Date(Date.now()-1000).toISOString());
      const read=await call('/tolls/route',{routePath:path,vehicleType:'car'});assert.equal(read.body.knownCost,8);assert.deepEqual(read.body.tolls[0].tariffs.map((x:any)=>x.price),[8,null]);assert.equal(read.body.tolls[0].missingPassages,1);assert.equal(read.body.status,'partial');
    });
    await t.test('own history includes aliases but does not disclose another contributor',async()=>{
      const mine=await call('/tolls/osm:node:821/contributions',undefined,author.cookie);assert.equal(mine.body.entries.length,2);
      assert.equal((await call('/tolls/osm:node:821/contributions',undefined,stranger.cookie)).body.entries.length,0);
      assert.equal((await call('/tolls/osm:node:821/contributions')).status,401);
      assert.equal((await call('/tolls/osm:node:821/contributions',{price:2.123,vehicleType:'car',confirmed:true,observedAt:observed},author.cookie)).status,400);
    });
    await t.test('a cached provider series reuses data but recalculates each departure and stay',async()=>{
      const departure=new Date(Date.now()+3600000).toISOString();
      const first=await call('/weather/route',{routePath:path,drivingMinutes:120,departureAt:departure});
      const second=await call('/weather/route',{routePath:path,drivingMinutes:120,departureAt:departure,stops:[{coords:[0,0.01],stayMinutes:60}]});
      assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(providerCalls,1);
      assert.equal(new Date(second.body.weatherPoints.at(-1).forecastAt).getTime()-new Date(first.body.weatherPoints.at(-1).forecastAt).getTime(),3600000);
    });
  }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
test('a failed weather provider returns unavailability, without fabricated forecasts',async()=>{
  const db=openDatabase(':memory:');const server=createApi({db,weatherFetch:async()=>new Response('{}',{status:503})}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{const res=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/weather/route`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routePath:[[0,0],[0,0.01]],drivingMinutes:30})});assert.equal(res.status,503);assert.equal((await res.json() as any).weatherPoints,undefined);}finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});

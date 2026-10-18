import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveConditionsRefresh,type WeatherResult,type TollResult} from '../src/services/routeConditions';
import type {TripPlan} from '../src/types';

const trip={
  id:'road-1',
  weatherPoints:[{locationName:'Trecho verificado',passTime:'14:00',tempC:21,
    condition:'Chuva Forte',rainProb:90,windKmH:15}],
  hasRainRisk:true,weatherSource:'Open-Meteo',weatherUpdatedAt:'2026-10-18T18:00:00.000Z',
  tollsUpdatedAt:'2026-10-18T17:00:00.000Z',knownTollsCost:14,
  tolls:[{id:'toll:verified',name:'Pedágio verificado',coords:[-23.5,-46.6],
    sourceUrl:'https://www.openstreetmap.org/node/123',passages:2,knownCost:14,price:7}],
  tollsStatus:'partial',estimatedFuelCost:100,totalFoodCost:30,totalEstimatedCost:144,costPerPerson:72,
  vehicleGroupType:'single_vehicle',groupVehiclesCount:1,splitExpenses:true,peopleCount:2
} as TripPlan;
const rejected=():PromiseRejectedResult=>({status:'rejected',reason:new Error('Secret provider response should never be shown')});
const weather:WeatherResult={weatherPoints:[{locationName:'Destino',passTime:'16:00',tempC:29,
  condition:'Ensolarado',rainProb:5,windKmH:8}],hasRainRisk:false,source:'Open-Meteo',
  updatedAt:'2026-10-18T19:00:00.000Z'};
const tolls:TollResult={tolls:[],knownCost:0,status:'unknown',mapUnavailable:false,
  updatedAt:'2026-10-18T19:00:00.000Z',warning:'Cobertura parcial'};
const done=<T>(value:T):PromiseFulfilledResult<T>=>({status:'fulfilled',value});

test('failed weather/toll providers keep verified rain hazards and known approved prices',()=>{
  const original=JSON.stringify(trip);
  const result=resolveConditionsRefresh(trip,rejected(),rejected());
  assert.deepEqual(result.patch,{tollsMapUnavailable:true});
  assert.match(result.weatherError,/pode estar desatualizada/);
  assert.match(result.tollError,/podem estar desatualizadas/);
  assert.doesNotMatch(result.weatherError+result.tollError,/Secret provider/);
  assert.equal(JSON.stringify(trip),original,'failure cannot mutate previously verified trip');
});

test('weather success updates forecast while toll failure keeps last cost and budget',()=>{
  const result=resolveConditionsRefresh(trip,done(weather),rejected());
  assert.equal(result.patch.hasRainRisk,false);
  assert.equal(result.patch.weatherUpdatedAt,weather.updatedAt);
  assert.deepEqual(result.patch.weatherPoints,weather.weatherPoints);
  assert.equal(result.patch.tollsMapUnavailable,true);
  assert.equal(result.patch.knownTollsCost,undefined);
  assert.equal(result.patch.totalEstimatedCost,undefined);
  assert.equal(result.patch.tolls,undefined);
});

test('toll success updates verified budget while weather failure keeps old rain warning',()=>{
  const result=resolveConditionsRefresh(trip,rejected(),done(tolls));
  assert.equal(result.patch.knownTollsCost,0,'verified new response may legitimately have no known toll');
  assert.equal(result.patch.totalEstimatedCost,130);
  assert.equal(result.patch.costPerPerson,65);
  assert.equal(result.patch.tollsUpdatedAt,tolls.updatedAt);
  assert.equal(result.patch.weatherPoints,undefined);
  assert.equal(result.patch.hasRainRisk,undefined);
  assert.match(result.weatherError,/pode estar desatualizada/);
  assert.equal(result.tollError,'');
});

test('no prior forecast or toll check never reports safe weather or free tolls',()=>{
  const empty={...trip,weatherUpdatedAt:undefined,tollsUpdatedAt:undefined,
    weatherPoints:[],tolls:[],knownTollsCost:0} as TripPlan;
  const result=resolveConditionsRefresh(empty,rejected(),rejected());
  assert.deepEqual(result.patch,{tollsMapUnavailable:true});
  assert.match(result.weatherError,/risco de chuva é desconhecido/);
  assert.match(result.tollError,/custo é desconhecido/);
});

test('partial response with map provider down still uses only confirmed server charges',()=>{
  const degraded={...tolls,knownCost:7,mapUnavailable:true};
  const result=resolveConditionsRefresh(trip,done(weather),done(degraded));
  assert.equal(result.patch.knownTollsCost,7);
  assert.equal(result.patch.tollsMapUnavailable,true);
  assert.match(result.tollError,/incompletos/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GPS_FRESHNESS_MS, isFreshGpsFix } from '../src/services/gpsFreshness';
import {activeNativeTripPosition} from '../src/services/activeNativeTripPosition';
import type {DeviceLocation} from '../src/services/locationService';

test('GPS precisa de leitura recente de no máximo seis segundos',()=>{
  const now=1_750_000_000_000;
  assert.equal(GPS_FRESHNESS_MS,6_000);
  for(const age of [0,1_000,5_999,6_000]){
    assert.equal(isFreshGpsFix(now-age,now),true,`age ${age}`);
  }
  for(const age of [6_001,10_000,60_000]){
    assert.equal(isFreshGpsFix(now-age,now),false,`age ${age}`);
  }
});
test('GPS rejeita datas inválidas e posições muito no futuro',()=>{
  const now=1_750_000_000_000;
  assert.equal(isFreshGpsFix(null,now),false);
  assert.equal(isFreshGpsFix(undefined,now),false);
  assert.equal(isFreshGpsFix(NaN,now),false);
  assert.equal(isFreshGpsFix(Infinity,now),false);
  assert.equal(isFreshGpsFix(now,NaN),false);
  assert.equal(isFreshGpsFix(now+5_000,now),true);
  assert.equal(isFreshGpsFix(now+5_001,now),false);
});
test('web, viagem, comboio e serviço nativo consultam a mesma política de frescor',()=>{
  const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  for(const path of ['src/hooks/useDeviceLocation.ts','src/hooks/useConvoyGps.ts']){
    assert.match(read(path),/isFreshGpsFix/,`${path} deve validar a idade de leituras de GPS`);
  }
  assert.match(read('src/hooks/useTripTracking.ts'),/activeNativeTripPosition/,
    'Rastreamento Android precisa validar sessão, serviço ativo e frescor');
  const android=read('android/app/src/main/java/br/com/roteirodeviagem/app/TravelLocationService.java');
  assert.match(android,/return age>=-5000 && age<=6000/);
  assert.match(android,/!isFreshGpsFix\(System\.currentTimeMillis\(\),location\.getTime\(\)\)/);
});

test('GPS nativo não mantém direção ativa quando serviço para, sinal vence ou muda de viagem',()=>{
  const now=1_750_000_000_000;
  const position:DeviceLocation={coords:[-23.55,-46.63],timestamp:now,
    accuracyMeters:8,speedMetersPerSecond:7,headingDegrees:90};
  const state={tripId:'guest:trip-1',running:true,position};
  assert.equal(activeNativeTripPosition(state,'guest:trip-1',now),position);
  assert.equal(activeNativeTripPosition({...state,running:false},'guest:trip-1',now),null);
  assert.equal(activeNativeTripPosition(state,'guest:trip-2',now),null);
  assert.equal(activeNativeTripPosition(state,undefined,now),null);
  assert.equal(activeNativeTripPosition(state,'guest:trip-1',now+6_001),null);
  assert.equal(activeNativeTripPosition({...state,position:null},'guest:trip-1',now),null);
});

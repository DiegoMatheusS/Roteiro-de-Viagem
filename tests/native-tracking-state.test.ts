import test from 'node:test';
import assert from 'node:assert/strict';
import {gpsStoppedByNotification,mergeNativeTrackingState,sameLocation,type NativeTrackingState} from '../src/services/nativeTrackingState';
import type {DeviceLocation} from '../src/services/locationService';

const fix=(over:Partial<DeviceLocation>={}):DeviceLocation=>({coords:[-23.55,-46.63],accuracyMeters:6,
  speedMetersPerSecond:12,headingDegrees:90,timestamp:1_000,...over});
const state=(over:Partial<NativeTrackingState>={}):NativeTrackingState=>({tripId:'t',distanceKm:1.2,
  position:fix(),error:null,running:true,stoppedByUser:false,...over});

test('uma consulta idêntica devolve o próprio estado anterior e não renderiza de novo',()=>{
  const previous=state();
  // A new object graph, exactly as the bridge deserializes it each poll.
  const next=state({position:fix({coords:[-23.55,-46.63]})});
  assert.notEqual(next.position,previous.position);
  assert.equal(mergeNativeTrackingState(previous,next),previous);
});

test('um fix novo troca a posição; só a distância mudando mantém a mesma posição',()=>{
  const previous=state();
  const moved=mergeNativeTrackingState(previous,state({position:fix({timestamp:3_000,coords:[-23.551,-46.631]})}));
  assert.notEqual(moved,previous);
  assert.equal(moved.position?.timestamp,3_000);
  const farther=mergeNativeTrackingState(previous,state({distanceKm:1.3,position:fix()}));
  assert.notEqual(farther,previous);
  assert.equal(farther.distanceKm,1.3);
  assert.equal(farther.position,previous.position,'a posição repetida mantém identidade (coords estável)');
});

test('perder o sinal, parar o serviço ou trocar de viagem sempre são propagados',()=>{
  const previous=state();
  assert.equal(mergeNativeTrackingState(previous,state({position:null,error:'Aguardando sinal GPS recente.'})).position,null);
  assert.equal(mergeNativeTrackingState(previous,state({running:false,error:'GPS interrompido.'})).running,false);
  assert.equal(mergeNativeTrackingState(previous,state({tripId:'other'})).tripId,'other');
  assert.equal(mergeNativeTrackingState(state({position:null}),state()).position?.timestamp,1_000);
});

test('sameLocation compara valores, inclusive precisão, velocidade e direção',()=>{
  assert.equal(sameLocation(fix(),fix()),true);
  assert.equal(sameLocation(fix(),fix({accuracyMeters:7})),false);
  assert.equal(sameLocation(fix(),fix({speedMetersPerSecond:null})),false);
  assert.equal(sameLocation(fix({headingDegrees:undefined}),fix({headingDegrees:null})),true);
  assert.equal(sameLocation(null,fix()),false);
  assert.equal(sameLocation(null,null),true);
});


test('rotação da bússola atualiza a interface sem alterar a posição GPS',()=>{
  const previous=state({deviceHeadingDegrees:25});
  const next=state({deviceHeadingDegrees:115,position:fix()});
  const merged=mergeNativeTrackingState(previous,next);
  assert.notEqual(merged,previous);
  assert.equal(merged.deviceHeadingDegrees,115);
  assert.equal(merged.position,previous.position);
  assert.equal(mergeNativeTrackingState(merged,state({deviceHeadingDegrees:115,position:fix()})),merged);
});

test('Parar GPS na notificação identifica apenas a viagem interrompida',()=>{
  const current='guest:viagem-42';
  assert.equal(gpsStoppedByNotification({running:false,stoppedTripId:current},current),true);
  assert.equal(gpsStoppedByNotification({running:true,stoppedTripId:current},current),false);
  assert.equal(gpsStoppedByNotification({running:false,stoppedTripId:'guest:outra'},current),false);
  assert.equal(gpsStoppedByNotification({running:false},current),false);
  assert.equal(gpsStoppedByNotification({running:false,stoppedTripId:current},''),false);
});

test('mudança de GPS parado pela notificação atualiza interface sem descartar o estado anterior',()=>{
  const previous=state({position:null,running:false,error:'GPS interrompido.'});
  const stopped=mergeNativeTrackingState(previous,state({position:null,running:false,stoppedByUser:true,error:'GPS interrompido.'}));
  assert.notEqual(stopped,previous);
  assert.equal(stopped.stoppedByUser,true);
  assert.equal(mergeNativeTrackingState(stopped,state({position:null,running:false,stoppedByUser:true,error:'GPS interrompido.'})),stopped);
  assert.equal(mergeNativeTrackingState(stopped,state()).stoppedByUser,false,'reconexão fecha o aviso');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {nextTurnCameraZoom} from '../src/services/navigationTurnCamera';

test('zoom de conversão usa apenas distância verificada, com escala adequada à velocidade',()=>{
  assert.equal(nextTurnCameraZoom(240,0,false),18.5);
  assert.equal(nextTurnCameraZoom(241,0,false),null);
  assert.equal(nextTurnCameraZoom(390,30,false),18.25);
  assert.equal(nextTurnCameraZoom(391,30,false),null);
});

test('faixa de histerese não oscila por ruído GPS perto de uma conversão',()=>{
  assert.equal(nextTurnCameraZoom(240,0,true),null);
  assert.equal(nextTurnCameraZoom(389,0,true),null);
  assert.equal(nextTurnCameraZoom(391,0,true),18);
  assert.equal(nextTurnCameraZoom(540,30,true),null);
  assert.equal(nextTurnCameraZoom(541,30,true),18);
});

test('sem manobra válida só desfaz zoom automático anterior; nunca inventa rota',()=>{
  for(const distance of [null,undefined,NaN,Infinity,-1]){
    assert.equal(nextTurnCameraZoom(distance,0,false),null);
    assert.equal(nextTurnCameraZoom(distance,0,true),18);
  }
  assert.equal(nextTurnCameraZoom(0,NaN,false),18.5);
  assert.equal(nextTurnCameraZoom(0,Infinity,false),18.5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mapSheetHeight,MAP_EXPANDED_HEIGHT} from '../src/services/mapSheetSizing';

test('map sheet grows upward on swipe while keeping a reserved GPS area',()=>{
  assert.equal(MAP_EXPANDED_HEIGHT,'min(65dvh, calc(100dvh - 220px))');
  assert.equal(mapSheetHeight(false,false),'116px');
  assert.equal(mapSheetHeight(false,true),'170px');
  assert.equal(mapSheetHeight(true,false),MAP_EXPANDED_HEIGHT);
  assert.equal(mapSheetHeight(false,false,-110),
    'clamp(116px, calc(116px + 110px), min(65dvh, calc(100dvh - 220px)))');
  assert.equal(mapSheetHeight(true,false,80),
    'clamp(116px, calc(min(65dvh, calc(100dvh - 220px)) - 80px), min(65dvh, calc(100dvh - 220px)))');
});
test('map sheet ignores invalid gesture distances',()=>{
  for(const v of [NaN,Infinity,-Infinity,0])assert.equal(mapSheetHeight(false,false,v),'116px');
});

test('map sheet reserves visible space for favorites below destination input',()=>{
  assert.equal(mapSheetHeight(false,false,0,true),'226px');
  assert.equal(mapSheetHeight(false,true,0,true),'280px');
  assert.equal(mapSheetHeight(false,false,-25,true),
    'clamp(226px, calc(226px + 25px), min(65dvh, calc(100dvh - 220px)))');
});

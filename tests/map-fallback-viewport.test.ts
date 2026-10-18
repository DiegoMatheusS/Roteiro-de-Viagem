import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMapFallbackViewport,sameMapFocus,type MapFallbackState} from '../src/services/mapFallbackViewport';
const state:MapFallbackState={mode:'exploring',centerRequest:3,position:[-23.5,-46.6],
  fittedRoute:'already-fitted',focusedCoords:[-23.4,-46.5]};
const reader={getCenter:()=>({lat:-23.55,lng:-46.63}),getZoom:()=>15.375};
test('fallback captures fractional zoom, explored center and consumed camera commands',()=>{
  const result=captureMapFallbackViewport(reader,state,19)!;
  assert.deepEqual(result,{...state,center:[-23.55,-46.63],zoom:15.375});
  result.position![0]=0;result.focusedCoords![0]=0;
  assert.deepEqual(state.position,[-23.5,-46.6]);
  assert.deepEqual(state.focusedCoords,[-23.4,-46.5]);
});
test('fallback rejects unreadable/invalid cameras and clamps zoom to provider limits',()=>{
  assert.equal(captureMapFallbackViewport({...reader,getCenter:()=>{throw Error('lost');}},state,19),undefined);
  assert.equal(captureMapFallbackViewport({...reader,getZoom:()=>NaN},state,19),undefined);
  assert.equal(captureMapFallbackViewport({...reader,getCenter:()=>({lat:91,lng:0})},state,19),undefined);
  assert.equal(captureMapFallbackViewport({...reader,getZoom:()=>22},state,18)?.zoom,18);
  assert.equal(captureMapFallbackViewport({...reader,getZoom:()=>0},state,18)?.zoom,1);
  assert.equal(captureMapFallbackViewport({...reader,getCenter:()=>({lat:10,lng:540})},state,18)?.center[1],540);
});
test('already applied focus compares coordinates, while a new focus remains actionable',()=>{
  assert.equal(sameMapFocus([-23.4,-46.5],[-23.4,-46.5]),true);
  assert.equal(sameMapFocus([-23.4,-46.5],[-23.41,-46.5]),false);
  assert.equal(sameMapFocus(null,[-23.4,-46.5]),false);
});

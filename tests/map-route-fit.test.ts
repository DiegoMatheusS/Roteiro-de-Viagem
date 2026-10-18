import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapRouteFitKey,shouldFitMapRoute,shouldAutoFitRouteCamera} from '../src/services/mapRouteFit';

const first:[[number,number],[number,number],[number,number]]=[
  [-23.55,-46.63],[-23.56,-46.64],[-23.58,-46.65]
];
const scenic:[[number,number],[number,number],[number,number]]=[
  [-23.55,-46.63],[-23.6,-46.61],[-23.58,-46.65]
];
const input={
  origin:first[0],destination:first[2],routePath:first,
  alternatives:[{id:'fast',routePath:first},{id:'scenic',routePath:scenic}]
};

test('switching the selected OSRM alternative does not trigger map camera fit',()=>{
  const original=mapRouteFitKey(input);
  const switched=mapRouteFitKey({...input,routePath:scenic});
  const reordered=mapRouteFitKey({...input,routePath:scenic,alternatives:[...input.alternatives].reverse()});
  assert.equal(switched,original);
  assert.equal(reordered,original);
  assert.equal(shouldFitMapRoute(original,switched,true),false);
  assert.equal(shouldFitMapRoute(original,reordered,true),false);
});

test('new destinations, origins and changed available route geometry trigger fit',()=>{
  const original=mapRouteFitKey(input);
  assert.notEqual(mapRouteFitKey({...input,origin:[-23.61,-46.62] as const}),original);
  assert.notEqual(mapRouteFitKey({...input,destination:[-23.62,-46.6] as const}),original);
  assert.notEqual(mapRouteFitKey({...input,alternatives:[{id:'other',routePath:scenic}]}),original);
  assert.notEqual(mapRouteFitKey({...input,alternatives:[{id:'fast',routePath:first},{id:'scenic',routePath:[...first]}]}),original);
  assert.equal(shouldFitMapRoute(original,mapRouteFitKey({...input,destination:[-23.62,-46.6] as const}),true),true);
});

test('single-route plans refit on a different real path, not on unrelated markers',()=>{
  const onlyRoute={...input,alternatives:[]};
  const original=mapRouteFitKey(onlyRoute);
  assert.notEqual(mapRouteFitKey({...onlyRoute,routePath:scenic}),original);
  assert.equal(shouldFitMapRoute(null,original,true),true);
  assert.equal(shouldFitMapRoute(null,original,false),false);
  assert.equal(shouldFitMapRoute(original,original,true),false);
});

test('MapLibre and Leaflet keep existing automatic initial fit and do not reset zoom on alternate selection',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(map,/const geometryKey=mapRouteFitKey\(\{/);
  assert.match(map,/routePath,alternatives:routeAlternatives/);
  assert.match(map,/shouldFitMapRoute\(fittedGeometryRef\.current,geometryKey,bounds\.length>0\)/);
  assert.match(map,/createHybridCameraPort\(map\)\.fitRoute\(bounds as \[number,number\]\[\],\{/);
  assert.match(map,/bottomRight:\[36,sheetOverlay\?/);
  assert.doesNotMatch(map,/stops\.map\(s=>\[s\.lat,s\.lng\]\),meetingPoints\.map\(p=>p\.coords\)/);
});


test('recalculating a route during navigation never steals camera control',()=>{
  assert.equal(shouldAutoFitRouteCamera(true,true,false),false,'valid GPS already owns the camera');
  assert.equal(shouldAutoFitRouteCamera(true,true,true),false,'manual camera exploration has priority');
  assert.equal(shouldAutoFitRouteCamera(true,false,true),false,'no GPS must not reset manual exploration');
  assert.equal(shouldAutoFitRouteCamera(true,false,false),true,'initial route fits before the first GPS fix');
  assert.equal(shouldAutoFitRouteCamera(false,true,true),true,'planning a new itinerary still fits all routes');
  const native=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
  const fallback=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(native,/shouldAutoFitRouteCamera\(!!p\.navigationMode,/);
  assert.match(fallback,/shouldAutoFitRouteCamera\(navigationMode,/);
});

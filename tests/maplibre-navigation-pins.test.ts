import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibleNavigationPins, toNavigationLngLat } from '../src/services/mapLibreNavigationPins';

const input = {
  origin: [-23.55, -46.63] as [number,number],
  destination: [-23.58, -46.65] as [number,number],
  live: [-23.56, -46.64] as [number,number],
  originLabel:'Origem',destinationLabel:'Destino',
  navigationMode:false,roadStyle:true
};

test('MapLibre draws exactly the navigation pins that have valid locations',()=>{
  assert.deepEqual(visibleNavigationPins(input),['origin','destination','live']);
  assert.deepEqual(visibleNavigationPins({...input,navigationMode:true}),['destination','live']);
  assert.deepEqual(visibleNavigationPins({...input,live:[Infinity,1]}),['origin','destination']);
  assert.deepEqual(visibleNavigationPins({...input,origin:[-95,-46]}),['destination','live']);
  assert.deepEqual(visibleNavigationPins({...input,destination:undefined}),['origin','live']);
  assert.deepEqual(toNavigationLngLat([-23.55,-46.63]),[-46.63,-23.55]);
});

test('navigation pins update without remounting on every GPS reading',()=>{
  const text=readFileSync(new URL('../src/services/mapLibreNavigationPins.ts',import.meta.url),'utf8');
  assert.match(text,/existing\.marker\.setLngLat\(toNavigationLngLat\(position\)\)/);
  assert.match(text,/new Popup\(\{offset:18,closeButton:true,closeOnClick:true\}\)/);
  assert.match(text,/\.setText\(/);
  assert.match(text,/setAttribute\('aria-label'/);
  assert.match(text,/marker\.remove\(\)/);
  assert.doesNotMatch(text,/\.setHTML\(/);
  assert.doesNotMatch(text,/innerHTML\s*=\s*label/);
});

test('Leaflet fallback and MapLibre switch do not create duplicate GPS endpoints',()=>{
  const text=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(text,/navigationPinGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(text,/if \(!vectorNavigationReady && layerChanges\.navigation\) \{/);
  assert.match(text,/if \(!markerCoords \|\| vectorNavigationReady/);
  assert.match(text,/vectorNavigationController\.current\?\.update\(navigationPinInputs\.current\)/);
  assert.match(text,/setVectorNavigationReady\(false\)/);
  assert.match(text,/L\.marker\(markerCoords/);
  assert.match(text,/routeAlternatives\.length > 1/);
  assert.match(text,/centerOnUserRequest/);
});

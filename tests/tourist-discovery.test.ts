import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextTouristDiscoveryAnchor} from '../src/hooks/useTouristDiscoveryAnchor';
import {placeIconKind} from '../src/services/placeIconKind';
import {poiCategory} from '../src/services/mapPoiPresentation';
import {mergeExplorePlaces} from '../src/services/explorePlaces';
import type {Place} from '../src/types/admin';

test('suggested and Explore places do not change on ordinary GPS jitter or temporary loss',()=>{
  const first:[number,number]=[-23.55,-46.63];
  const retained=nextTouristDiscoveryAnchor(undefined,first);
  assert.deepEqual(retained,first);
  assert.equal(nextTouristDiscoveryAnchor(retained,[-23.5502,-46.6302]),retained);
  assert.equal(nextTouristDiscoveryAnchor(retained,undefined),retained);
  assert.equal(nextTouristDiscoveryAnchor(retained,[NaN,-46.63]),retained);
  const travelled=nextTouristDiscoveryAnchor(retained,[-23.553,-46.63]);
  assert.notEqual(travelled,retained,'real movement changes the discovery area');
  assert.deepEqual(travelled,[-23.553,-46.63]);
});

test('Home nearby and Explore catalog share stable GPS anchor; routes use live GPS',()=>{
  const home=readFileSync(new URL('../src/components/NavigationHome.tsx',import.meta.url),'utf8');
  const explore=readFileSync(new URL('../src/components/ToursTab.tsx',import.meta.url),'utf8');
  assert.match(home,/useTouristDiscoveryAnchor\(liveCoords\)/);
  assert.match(home,/useNearbyPlaces\(touristOrigin\?\[touristOrigin\]/);
  assert.match(home,/distanceBetweenKm\(touristOrigin,/);
  assert.match(explore,/useTouristDiscoveryAnchor\(origin\)/);
  assert.match(explore,/mergeExplorePlaces\(places,touristOrigin\)/);
  assert.match(explore,/filterExplorePlaces\(allPlaces,filter,query,touristOrigin,area\)/);
  assert.match(explore,/fetchRouteChoices\(origin,place\.coords/);
  const circuit=readFileSync(new URL('../src/components/CreateTouristCircuitScreen.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(circuit,/nearbySuggestions\.length\?'Pontos próximos/);
  assert.match(circuit,/>Pontos próximos para seu rolê</);
});

test('legacy generic tourist records appear in Explore with the inferred visual category',()=>{
  const oldPlace:Place={id:'old-theatre',name:'Teatro Municipal',kind:'other',
    lat:-23.55,lng:-46.63,address:'São Paulo, SP',sourceUrl:'',description:'',
    website:'',phone:'',active:true};
  const found=mergeExplorePlaces([oldPlace],undefined,[]);
  assert.equal(found.length,1);
  assert.equal(found[0].kind,'theatre');
  assert.equal(found[0].category,'Cultura');
  assert.equal(oldPlace.kind,'other','do not rewrite the catalogued classification');
});

test('verified type has its icon; legacy generic names get the correct glyph without changing data',()=>{
  assert.equal(placeIconKind('other','Parque Villa-Lobos'),'park');
  assert.equal(placeIconKind('attraction','Teatro Municipal de São Paulo'),'theatre');
  assert.equal(placeIconKind('other','Praça da República'),'square');
  assert.equal(placeIconKind('park','Praça dos Três Poderes'),'square');
  assert.equal(placeIconKind('other','Museu da Língua Portuguesa'),'museum');
  assert.equal(placeIconKind('attraction','Ponte Estaiada'),'landmark');
  assert.equal(placeIconKind('other','Shopping Center Norte'),'shopping');
  assert.equal(placeIconKind('other','Local de nome indefinido'),'other');
  assert.equal(placeIconKind('park','Teatro dentro do parque'),'park',
    'explicit admin category is authoritative');
  assert.equal(poiCategory({kind:'place',id:'1',coords:[-23.55,-46.63],
    name:'Teatro Municipal',category:'other'}),'theatre');
  const icon=readFileSync(new URL('../src/components/mapPlaceIcon.ts',import.meta.url),'utf8');
  const vector=readFileSync(new URL('../src/services/mapLibrePlaceMarkers.ts',import.meta.url),'utf8');
  const raster=readFileSync(new URL('../src/services/leafletPlaceMarkers.ts',import.meta.url),'utf8');
  assert.match(icon,/square: '<path/);
  assert.match(icon,/park: '<path/);
  assert.match(icon,/theatre: '<path/);
  assert.match(icon,/other: '<rect/);
  assert.match(vector,/mapPlaceIcon\(iconKind,entry\.name\)/);
  assert.match(raster,/mapPlaceIcon\(category,entry\.name\)/);
});

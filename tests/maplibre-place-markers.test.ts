import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectRoleVectorMarkers, toMarkerLngLat,rolePlaceMarkerKey,rolePlaceMarkerSignature } from '../src/services/vectorPlaceData';
import type { FuelStation, FuelPrice } from '../src/types/fuel';
import type { Place } from '../src/types/admin';
import type { RouteToll } from '../src/types/tolls';

const price: FuelPrice = {
  id:'approved',fuelType:'gasolina_comum',price:5.89,
  observedAt:'2026-10-17T17:00:00Z',publishedAt:'2026-10-17T18:00:00Z',
  source:'admin',confirmations:2,contests:0,reliabilityScore:90,
  reliability:'Alta',stale:false,disputed:false
};
const station: FuelStation = {
  id:'osm:node:1',name:'Posto verificado',lat:-23.55,lng:-46.63,address:'Rua Teste',
  source:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/node/1',
  mapUpdatedAt:'2026-10-17T17:00:00Z',prices:[price]
};
const toll: RouteToll = {id:'osm:way:2',name:'Praça real',coords:[-23.56,-46.64],
  sourceUrl:'https://www.openstreetmap.org/way/2',passages:1,price:12.5};
const place:Place = {
  id:'osm:node:3',name:'Mirante real',kind:'viewpoint',lat:-23.57,lng:-46.65,
  address:'',sourceUrl:'https://www.openstreetmap.org/node/3',
  description:'',website:'',phone:'',active:true
};
const managedToll:Place = {...place,id:'osm:way:2',name:'Praça real',kind:'toll'};

test('pins MapLibre só incluem entidades reais e não duplicam praça com tarifa',()=>{
 const entries=selectRoleVectorMarkers({stations:[station],places:[place,managedToll,{...place,id:station.id,kind:'fuel'}],
   tolls:[toll],tollVehicleType:'car',navigationMode:false});
 assert.deepEqual(entries.map(entry=>entry.kind),['fuel','toll','place']);
 assert.equal(entries.filter(entry=>entry.id===toll.id).length,1);
 assert.equal(entries.filter(entry=>entry.id===station.id).length,1);
 assert.match(entries.find(entry=>entry.kind==='fuel')?.priceLabel||'',/5,89/);
 assert.match(entries.find(entry=>entry.kind==='toll')?.priceLabel||'',/12,50/);
 assert.deepEqual(toMarkerLngLat([-23.55,-46.63]),[-46.63,-23.55]);
});
test('sem preço aprovado não fabrica valor e navegação permite cartões por categoria',()=>{
 const entries=selectRoleVectorMarkers({stations:[{...station,prices:[{...price,stale:true}]}],
  places:[place,managedToll,{...place,id:'restaurant',kind:'restaurant'}],
  tolls:[toll],tollVehicleType:'car',navigationMode:false});
 assert.equal(entries.find(entry=>entry.kind==='fuel')?.priceLabel,null);
 const nav=selectRoleVectorMarkers({stations:[station],places:[place,managedToll],
  tolls:[toll],tollVehicleType:'car',navigationMode:true});
 assert.deepEqual(nav.map(entry=>entry.kind),['fuel','toll','place']);
});
test('faixas da mesma praça usam o pedágio com tarifa do trajeto',()=>{
 const lane={...managedToll,id:'osm:node:neighbor',lat:toll.coords[0]+0.0001,lng:toll.coords[1]};
 const separate={...lane,id:'admin:another-toll',lat:toll.coords[0]+0.01};
 for(const navigationMode of [false,true]){
  const entries=selectRoleVectorMarkers({stations:[],places:[lane,separate],tolls:[toll],
   tollVehicleType:'car',navigationMode});
  assert.deepEqual(entries.map(entry=>entry.id),[toll.id,separate.id]);
  assert.match(entries[0].kind==='toll'?entries[0].priceLabel||'':'',/12,50/);
 }
});
test('marcadores com coordenadas inválidas não são exibidos',()=>{
 const entries=selectRoleVectorMarkers({stations:[{...station,lat:Infinity}],places:[{...place,lng:190}],
  tolls:[],navigationMode:false});
 assert.equal(entries.length,0);
});
test('componentes MapLibre mantêm botão de preços, acessibilidade e fallback Leaflet',()=>{
 const path=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const gl=path('src/services/mapLibrePlaceMarkers.ts');
 const map=path('src/components/InteractiveMap.tsx');
 assert.match(gl,/new Marker\(\{element:root,anchor,offset\}\)/);
 assert.match(gl,/\.setLngLat\(toMarkerLngLat\(entry\.coords\)\)/);
 assert.match(gl,/setAttribute\('aria-label'/);
 assert.match(gl,/bindMapMarkerActivation\(root,activate\)/);
 assert.match(gl,/marker\.remove\(\)/);
 assert.match(map,/vectorMarkersReady\)return;/);
 assert.match(map,/setVectorMarkersReady\(false\)/);
 assert.match(map,/vectorPlaceControllerRef\.current\?\.destroy\(\)/);
 assert.match(map,/createLeafletPlaceMarkerController/);
});

test('incremental keys preserve marker identity across coordinate refreshes',()=>{
 const base={kind:'fuel' as const,id:station.id,coords:[station.lat,station.lng] as [number,number],
   name:station.name,priceLabel:'R$ 5,89'};
 const moved={...base,coords:[-23.56,-46.64] as [number,number]};
 const repriced={...base,priceLabel:'R$ 5,99'};
 assert.equal(rolePlaceMarkerKey(base),rolePlaceMarkerKey(moved));
 assert.equal(rolePlaceMarkerSignature(base),rolePlaceMarkerSignature(moved));
 assert.equal(rolePlaceMarkerSignature(base),rolePlaceMarkerSignature(repriced),'price refresh keeps the compact pin');
 assert.notEqual(rolePlaceMarkerSignature(base),rolePlaceMarkerSignature({...base,name:'Outro posto'}));
 assert.notEqual(rolePlaceMarkerKey(base),rolePlaceMarkerKey({...base,kind:'place',category:place.kind} as never));
});
test('a fuel/toll update does not recreate all native MapLibre markers',()=>{
 const path=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const controller=path('src/services/mapLibrePlaceMarkers.ts');
 const map=path('src/components/InteractiveMap.tsx');
 assert.match(controller,/createRoleMaplibreMarkerController\(/);
 assert.match(controller,/existing\?\.visualSignature===signature/);
 assert.match(controller,/existing\.marker\.setLngLat\(toMarkerLngLat\(entry\.coords\)\)/);
 assert.match(controller,/existing\?\.marker\.remove\(\)/);
 assert.match(controller,/const \{marker,unbind\}=buildMarker\(entry\)/);
 assert.match(controller,/if\(destroyed\)return/);
 assert.match(map,/controller\.update\(selectRoleVectorMarkers\(vectorPlaceInputsRef\.current\)\)/);
 assert.match(map,/vectorPlaceActionsRef\.current\.onStation/);
 assert.match(map,/vectorPlaceControllerRef\.current=controller/);
 const install=map.slice(map.indexOf('// Install MapLibre pins once'),map.indexOf('// Incremental updates:'));
 assert.match(install,/\},\[vectorRoutesReady\]\)/);
 assert.doesNotMatch(install,/\[vectorRoutesReady,\s*fuel\.stations/);
 assert.match(map,/vectorMarkersReady\)return;/);
});

test('atualizações de GPS só gravam no DOM os atributos que realmente mudaram',()=>{
 const controller=readFileSync(new URL('../src/services/mapLibrePlaceMarkers.ts',import.meta.url),'utf8');
 const apply=controller.slice(controller.indexOf('const applyVisibility'),controller.indexOf('const buildMarker'));
 // Every DOM write inside the per-marker loop must sit behind a change check.
 assert.match(apply,/if\(record\.visible!==visible\)\{[^}]*element\.style\.display=/);
 const loop=apply.slice(apply.indexOf('for(const record of markers.values())'));
 const unguarded=loop.replace(/if\(record\.\w+!==[^)]+\)\{[^}]*\}/g,'');
 assert.doesNotMatch(unguarded,/element\.(dataset\.|style\.|setAttribute)/,
   'uma escrita no elemento ficou fora da verificação de mudança');
 // A rebuilt marker starts unknown so its first pass writes every attribute.
 assert.match(controller,/visible:null/);
});

test('ícones permanecem georreferenciados e sem nomes fixos abaixo',()=>{
 const controller=readFileSync(new URL('../src/services/mapLibrePlaceMarkers.ts',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/role-map-poi.css',import.meta.url),'utf8');
 const raster=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(controller,/role-poi-label|poiLabel/);
 assert.doesNotMatch(css,/\.role-poi-label|data-poi-label/);
 assert.doesNotMatch(raster,/permanent:\s*Boolean\(place\.managed\)/);
 assert.doesNotMatch(raster,/placeZoom|setPlaceZoom/);
 assert.match(controller,/\.setLngLat\(toMarkerLngLat\(entry\.coords\)\)/);
 assert.match(raster,/createLeafletPlaceMarkerController/);
 assert.match(controller,/root\.setAttribute\('aria-label'/);
});

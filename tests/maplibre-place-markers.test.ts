import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectRoleVectorMarkers, toMarkerLngLat } from '../src/services/vectorPlaceData';
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
test('sem preço aprovado não fabrica valor e modo navegação mantém apenas pontos turísticos',()=>{
 const entries=selectRoleVectorMarkers({stations:[{...station,prices:[{...price,stale:true}]}],
  places:[place,managedToll,{...place,id:'restaurant',kind:'restaurant'}],
  tolls:[toll],tollVehicleType:'car',navigationMode:false});
 assert.equal(entries.find(entry=>entry.kind==='fuel')?.priceLabel,null);
 const nav=selectRoleVectorMarkers({stations:[station],places:[place,managedToll],
  tolls:[toll],tollVehicleType:'car',navigationMode:true});
 assert.deepEqual(nav.map(entry=>entry.kind),['place']);
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
 assert.match(gl,/disableClickPropagation\(root\)/);
 assert.match(gl,/marker\.remove\(\)/);
 assert.match(map,/if \(vectorMarkersReady\) return;/);
 assert.match(map,/setVectorMarkersReady\(false\)/);
 assert.match(map,/removeMarkers\?\.\(\)/);
 assert.match(map,/L\.marker\(\[station\.lat, station\.lng\]/);
});

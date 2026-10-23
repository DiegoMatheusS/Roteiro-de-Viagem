import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Feature,Polygon,MultiPolygon} from 'geojson';
import type {Map as MapLibreMap} from 'maplibre-gl';
import {buildingContainsLocation,selectRegisteredBuildingFootprints,createRegisteredBuildingController,
 REGISTERED_BUILDINGS_FILL,REGISTERED_BUILDINGS_OUTLINE,REGISTERED_BUILDINGS_SOURCE}
  from '../src/services/mapRegisteredBuildings';
import type {RoleVectorMarker} from '../src/services/vectorPlaceData';

const square=(x=-46.6,y=-23.5,size=.00015):Polygon=>({
 type:'Polygon',coordinates:[[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]]
});
const registered=(id:string,coords:[number,number]=[-23.4999,-46.5999],category:'restaurant'|'hotel'='restaurant'):RoleVectorMarker=>
 ({kind:'place',id,coords,name:'Local cadastrado',category});
const verified:Feature<Polygon>={type:'Feature',properties:{},geometry:square()};
const location:[number,number]=[-23.4999,-46.5999];

test('só associa um prédio quando coordenada cadastrada está realmente dentro do polígono OSM',()=>{
 const data=selectRegisteredBuildingFootprints([registered('one')],()=>[verified],17,()=>true);
 assert.equal(data.features.length,1);
 assert.equal(data.features[0].properties.color,'#ea580c');
 assert.equal(data.features[0].properties.placeId,'one');
 assert.deepEqual(data.features[0].geometry,verified.geometry);
 assert.equal(buildingContainsLocation(square(),location),true);
 assert.equal(buildingContainsLocation(square(),[-23.498,-46.598]),false);
 assert.equal(selectRegisteredBuildingFootprints([registered('street',[-23.498,-46.598])],()=>[verified],17,()=>true).features.length,0);
 assert.equal(selectRegisteredBuildingFootprints([registered('one')],()=>[verified],15.99,()=>true).features.length,0);
 assert.equal(selectRegisteredBuildingFootprints([registered('one')],()=>[verified],17,()=>false).features.length,0);
});

test('respeita furos dos prédios, polígonos múltiplos e pontos fora do local',()=>{
 const hole:Polygon={type:'Polygon',coordinates:[
   square().coordinates[0],
   [[-46.59997,-23.49997],[-46.59993,-23.49997],[-46.59993,-23.49993],[-46.59997,-23.49993],[-46.59997,-23.49997]]
 ]};
 assert.equal(buildingContainsLocation(hole,[-23.49995,-46.59995]),false);
 assert.equal(buildingContainsLocation(hole,[-23.49990,-46.59990]),true);
 const multipolygon:MultiPolygon={type:'MultiPolygon',coordinates:[
   square(-47,-24).coordinates,square().coordinates
 ]};
 assert.equal(buildingContainsLocation(multipolygon,location),true);
 assert.equal(buildingContainsLocation(multipolygon,[-22,-45]),false);
});

test('não atribui prédio de shopping inteiro a duas lojas nem cria contorno artificial',()=>{
 const data=selectRegisteredBuildingFootprints([
  registered('restaurante'),registered('hotel',location,'hotel')
 ],()=>[verified],17,()=>true);
 assert.equal(data.features.length,0,'prédio ambíguo fica sem cor');
 const withoutBuilding=selectRegisteredBuildingFootprints([registered('restaurante')],()=>[],17,()=>true);
 assert.equal(withoutBuilding.features.length,0);
 const wrongGeometry:Feature={type:'Feature',properties:{},geometry:{type:'Point',coordinates:[-46.6,-23.5]}};
 assert.equal(selectRegisteredBuildingFootprints([registered('one')],()=>[wrongGeometry],17,()=>true).features.length,0);
 assert.equal(selectRegisteredBuildingFootprints([{kind:'fuel',id:'fuel',name:'Posto',priceLabel:null,coords:location}],()=>[verified],17,()=>true).features.length,0);
});

test('camada é incremental: GPS não envia GeoJSON novo, zoom e estilo reconstroem camadas',()=>{
 const events=new Map<string,Set<()=>void>>();
 const layers=new Map<string,unknown>([['building',{type:'fill'}],['role-alternative-outline',{}]]);
 const sources=new Map<string,{setData:(data:unknown)=>void}>();
 let queries=0,uploads=0,creates=0;
 const map={
  on(event:string,fn:()=>void){if(!events.has(event))events.set(event,new Set());events.get(event)!.add(fn);},
  off(event:string,fn:()=>void){events.get(event)?.delete(fn);},
  isStyleLoaded:()=>true,getZoom:()=>17,
  getCenter:()=>({lat:-23.5,lng:-46.6}),
  getBounds:()=>({contains:()=>true}),
  getLayer:(key:string)=>layers.get(key),
  getSource:(key:string)=>sources.get(key),
  addSource(key:string,options:{data:unknown}){
    creates++;sources.set(key,{setData:()=>{uploads++;}});
    assert.equal((options.data as {type:string}).type,'FeatureCollection');
  },
  addLayer(options:{id:string},before:string){assert.equal(before,'role-alternative-outline');layers.set(options.id,options);},
  project:()=>({x:100,y:100}),
  queryRenderedFeatures:()=>{queries++;return [verified];}
 } as unknown as MapLibreMap;
 const controller=createRegisteredBuildingController(map);
 controller.update([registered('first')]);
 assert.equal(queries,1);assert.equal(creates,1);assert.equal(uploads,0);
 assert.ok(layers.has(REGISTERED_BUILDINGS_FILL));
 assert.ok(layers.has(REGISTERED_BUILDINGS_OUTLINE));
 assert.ok(sources.has(REGISTERED_BUILDINGS_SOURCE));
 controller.update([registered('first')]);
 assert.equal(queries,1,'re-render de GPS sem alteração de POIs não consulta polígonos');
 events.get('moveend')?.forEach(fn=>fn());
 assert.equal(queries,1,'câmera estável não reconsulta prédios');
 controller.update([registered('first',[-23.49989,-46.59989])]);
 assert.equal(queries,2,'coordenada cadastrada alterada recebe nova verificação');
 controller.destroy();
 events.get('moveend')?.forEach(fn=>fn());
 assert.equal(queries,2);
});

test('mapa integra contornos antes das rotas sem alterar README',()=>{
 const component=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
 assert.match(component,/createRegisteredBuildingController\(map\)/);
 assert.match(component,/registeredBuildings.update\(p.navigationMode\?\[\]:drawn\)/);
 assert.match(component,/if\(overlaysChanged\)/);
 assert.match(component,/if\(markersChanged\)/);
 assert.match(component,/registeredBuildings.destroy\(\)/);
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 assert.doesNotMatch(readme,/\bPR\s*#?\d+\b/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectRouteMilestones,MAX_ROUTE_MILESTONES} from '../src/services/routeMilestones';
import {buildRoleMilestoneFeatures,updateRoleVectorMilestones,clearRoleVectorMilestones} from '../src/services/mapLibreRouteMilestones';

type Point=[number,number];
const short:Point[]=Array.from({length:14},(_,i)=>[-23.5+i*0.0001,-46.6-i*0.0001]);

test('only existing road-geometry points are rendered, never invented intermediates',()=>{
  const markers=selectRouteMilestones(short);
  assert.deepEqual(markers,[short[3],short[6],short[9],short[12]]);
  assert.ok(markers.every(x=>short.includes(x)));
  assert.equal(markers.includes(short[0]),false);
  assert.equal(markers.includes(short[short.length-1]),false);
  assert.deepEqual(buildRoleMilestoneFeatures(short).features[0].geometry.coordinates,
    [short[3][1],short[3][0]]);
});
test('long routes do not create thousands of Leaflet markers or vector features',()=>{
  const long:Point[]=Array.from({length:60001},(_,i)=>[-22+i*0.00001,-47+i*0.00001]);
  const dots=selectRouteMilestones(long);
  assert.ok(dots.length>0);
  assert.ok(dots.length<=MAX_ROUTE_MILESTONES);
  assert.ok(dots.every(p=>long.includes(p)));
  assert.equal(buildRoleMilestoneFeatures(long).features.length,dots.length);
  assert.ok(selectRouteMilestones(long,10).length<=10);
  assert.deepEqual(selectRouteMilestones(long,0),[]);
});
test('invalid or duplicate coordinates are not added, raster and MapLibre use same subset',()=>{
  const input:Point[]=[...short];
  input[6]=[NaN,2];
  input[9]=input[3];
  assert.deepEqual(selectRouteMilestones(input),[short[3],short[12]]);
  assert.deepEqual(selectRouteMilestones([[-23,190],[-23,191]] as Point[]),[]);
});
test('native MapLibre circle layer is non-interactive and follows route modality color',()=>{
  let sourceData:unknown;
  let sourceExists=false;
  let layer:Record<string,unknown>|undefined;
  let layerRemoved=false;
  let sourceRemoved=false;
  let paint:{property:string;color:unknown}|undefined;
  const map={
    isStyleLoaded:()=>true,
    getSource:()=>sourceExists?{setData:(d:unknown)=>{sourceData=d;}}:undefined,
    addSource:(_id:string,config:{data:unknown})=>{sourceExists=true;sourceData=config.data;},
    getLayer:()=>layerRemoved?undefined:layer,
    addLayer:(input:Record<string,unknown>)=>{layer=input;},
    setPaintProperty:(_id:string,property:string,color:unknown)=>{paint={property,color};},
    removeLayer:()=>{layerRemoved=true;},
    removeSource:()=>{sourceRemoved=true;sourceExists=false;}
  };
  type Gl=Parameters<typeof updateRoleVectorMilestones>[0];
  assert.equal(updateRoleVectorMilestones(map as unknown as Gl,short,'#059669',true),4);
  assert.equal(layer?.type,'circle');
  assert.equal((layer?.paint as Record<string,unknown>)['circle-stroke-color'],'#059669');
  assert.equal((sourceData as {features:unknown[]}).features.length,4);
  assert.equal(updateRoleVectorMilestones(map as unknown as Gl,short,'#2563eb',true),4);
  assert.deepEqual(paint,{property:'circle-stroke-color',color:'#2563eb'});
  assert.equal(updateRoleVectorMilestones(map as unknown as Gl,short,'#059669',false),0);
  assert.equal((sourceData as {features:unknown[]}).features.length,0);
  clearRoleVectorMilestones(map as unknown as Parameters<typeof clearRoleVectorMilestones>[0]);
  assert.equal(layerRemoved,true);assert.equal(sourceRemoved,true);
});
test('raster fallback and vector decorations both remain independent of GPS updates',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(map,/milestoneGroupRef\.current=L\.layerGroup\(\)\.addTo\(map\)/);
  assert.match(map,/updateRoleVectorMilestones\(gl,routePath/);
  assert.match(map,/milestoneGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(map,/for\(const point of selectRouteMilestones\(routePath\)\)/);
  assert.match(map,/L\.marker\(point,\{icon,interactive:false,keyboard:false\}\)\.addTo\(group\)/);
  assert.match(map,/clearRoleVectorMilestones\(activeVector\)/);
  const begin=map.indexOf('// Milestone dots are decoration only.');
  const end=map.indexOf('// Base vetorial pronta:',begin);
  const block=map.slice(begin,end);
  assert.ok(begin>0 && end>begin);
  assert.doesNotMatch(block,/travelledDistanceKm|userLiveCoords|totalRouteKm/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRoleRouteCollection,queryRoleVectorAlternative} from '../src/services/mapLibreRouteLayers';

type LatLng=[number,number];
const chosen:LatLng[]=[[-23.54,-46.63],[-23.55,-46.64],[-23.56,-46.65]];
const scenic:LatLng[]=[[-23.54,-46.63],[-23.58,-46.62],[-23.56,-46.65]];
const opts={routePath:chosen,alternatives:[
  {id:'scenic',routePath:scenic},{id:'fast',routePath:chosen}
],selectedRouteId:'fast',modalityColor:'#2563eb',travelledDistanceKm:0,
totalRouteKm:3,navigationMode:false,blueRoute:false};

test('vector alternatives carry only their verified source route IDs',()=>{
  const collection=buildRoleRouteCollection(opts);
  const alternatives=collection.features.filter(f=>f.properties.role==='alternative');
  assert.deepEqual(alternatives.map(f=>f.properties.routeId),['scenic']);
  assert.deepEqual(alternatives[0].geometry.coordinates[1],[-46.62,-23.58]);
  const invalid=buildRoleRouteCollection({...opts,alternatives:[
    {id:'fake',routePath:[[-23.54,-46.63],[Infinity,0]] as LatLng[]},{id:'fast',routePath:chosen}
  ]});
  assert.equal(invalid.features.some(f=>f.properties.routeId==='fake'),false);
  const navigation=buildRoleRouteCollection({...opts,navigationMode:true});
  assert.equal(navigation.features.some(f=>f.properties.role==='alternative'),false);
});

test('touch queries MapLibre visible alternative line only; preserves correct GPS coordinates',()=>{
  let queries=0;
  let bounds:unknown;
  const stub={
    isStyleLoaded:()=>true,
    getLayer:(id:string)=>id==='role-alternative-line'?{id}:undefined,
    project:()=>({x:125,y:265}),
    queryRenderedFeatures:(box:unknown,config:unknown)=>{
      queries++;bounds=box;
      assert.deepEqual(config,{layers:['role-alternative-line']});
      return [
        {properties:{role:'active',routeId:'fast'}},
        {properties:{role:'alternative',routeId:'untrusted'}},
        {properties:{role:'alternative',routeId:'scenic'},geometry:{type:'LineString',coordinates:[[-46.62,-23.58],[-46.61,-23.57]]}}
      ];
    }
  };
  type Gl=Parameters<typeof queryRoleVectorAlternative>[0];
  assert.equal(queryRoleVectorAlternative(stub as unknown as Gl,scenic[1],new Set(['scenic'])), 'scenic');
  assert.equal(queries,1);
  assert.deepEqual(bounds,[[113,253],[137,277]]);
  assert.equal(queryRoleVectorAlternative(stub as unknown as Gl,scenic[1],new Set(['fast'])),null);
  assert.equal(queryRoleVectorAlternative(stub as unknown as Gl,[Infinity,0],new Set(['scenic'])),null);
  assert.equal(queryRoleVectorAlternative(stub as unknown as Gl,scenic[1],new Set()),null);
  assert.equal(queries,2);
});

test('when WebGL/style is not ready, vector hit test fails safely into Leaflet fallback',()=>{
  type Gl=Parameters<typeof queryRoleVectorAlternative>[0];
  const invisible={
    isStyleLoaded:()=>false,
    getLayer:()=>undefined,
    project:()=>{throw Error('should not project')},
    queryRenderedFeatures:()=>{throw Error('should not query')}
  };
  assert.equal(queryRoleVectorAlternative(invisible as unknown as Gl,scenic[1],new Set(['scenic'])),null);
});

test('click-to-select uses MapLibre route IDs when vector ready and Leaflet when offline',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(map,/queryRoleVectorAlternative\(gl,/);
  assert.match(map,/alternativeRouteIdsRef\.current\.size/);
  assert.match(map,/if\(id\)\{selectRouteRef\.current\(id\);return;\}/);
  assert.match(map,/onSelectCoordinates\?\.\(\[event\.latlng\.lat,event\.latlng\.lng\]\)/);
  assert.match(map,/if \(!vectorRoutesReady \|\| !vectorRoutePaintReady\) \{/);
  assert.match(map,/alternative\.on\('click',\(\)=>selectRouteRef\.current\?\.\(option\.id\)\)/);
  assert.doesNotMatch(map,/opacity:vectorRoutesReady \? 0\.003/);
  assert.doesNotMatch(map,/weight:vectorRoutesReady \? 18/);
});


test('nearest screen segment wins over renderer order and retains verified route IDs',()=>{
  type Gl=Parameters<typeof queryRoleVectorAlternative>[0];
  const line=(id:string,y:number)=>({properties:{role:'alternative',routeId:id},
    geometry:{type:'LineString',coordinates:[[-20,y],[20,y]]}});
  let features:unknown[]=[line('far',10),line('near',2),line('foreign',0)];
  const stub={isStyleLoaded:()=>true,getLayer:()=>({}),
    project:([x,y]:[number,number])=>({x,y}),queryRenderedFeatures:()=>features};
  const query=(radius=12)=>queryRoleVectorAlternative(stub as unknown as Gl,[0,0],new Set(['far','near']),radius);
  assert.equal(query(),'near');
  features.reverse();
  assert.equal(query(),'near');
  assert.equal(query(NaN),'near');
  features=[line('near',13)];
  assert.equal(query(),null);
  features=[{properties:{role:'alternative',routeId:'near'},geometry:{type:'MultiLineString',
    coordinates:[[[-20,15],[20,15]],[[-20,1],[20,1]]]}}];
  assert.equal(query(),'near');
  // A line crossing the square query box but outside the circular tap radius must not win.
  features=[{properties:{role:'alternative',routeId:'near'},geometry:{type:'LineString',
    coordinates:[[10,10],[12,12]]}}];
  assert.equal(query(),null);
  // Malformed gaps must never be joined into a fictitious selectable line.
  features=[{properties:{role:'alternative',routeId:'near'},geometry:{type:'LineString',
    coordinates:[[-20,0],[NaN,0],[20,0]]}}];
  assert.equal(query(),null);
  features=[line('far',2),line('near',2)];
  assert.equal(query(),'far');
});

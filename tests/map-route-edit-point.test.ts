import test from 'node:test';
import assert from 'node:assert/strict';
import {routeEditPoint,type EditPoint} from '../src/services/mapRouteEditPoint';
import {queryRoleRouteEditPoint} from '../src/services/mapLibreRouteLayers';
const project=([lat,lon]:EditPoint)=>({x:lon*100,y:lat*100});
const road:EditPoint[]=[[0,0],[0,1]];

test('tocar perto da linha seleciona o segmento real; tocar fora não cria bolinha',()=>{
  assert.deepEqual(routeEditPoint({x:50,y:6},[road],project),[0,.5]);
  assert.equal(routeEditPoint({x:50,y:20},[road],project),null);
  assert.equal(routeEditPoint({x:120,y:0},[road],project),null);
  assert.equal(routeEditPoint({x:NaN,y:0},[road],project),null);
});
test('não conecta falhas de geometria nem escolhe linha distante',()=>{
  const broken:EditPoint[]=[[0,0],[NaN,0],[0,1]];
  assert.equal(routeEditPoint({x:50,y:0},[broken],project),null);
  assert.deepEqual(routeEditPoint({x:50,y:8},[road,[[.1,0],[.1,1]]],project),[.1,.5]);
});
test('o editor vetorial considera apenas a rota ativa realmente renderizada',()=>{
  const gl={getLayer:(id:string)=>id==='role-active-outline'?{}:undefined,
    project:([lon,lat]:EditPoint)=>project([lat,lon]),
    queryRenderedFeatures:()=>[
      {properties:{role:'alternative'},geometry:{type:'LineString',coordinates:[[0,.1],[1,.1]]}},
      {properties:{role:'active'},geometry:{type:'LineString',coordinates:[[0,0],[1,0]]}}
    ]} as unknown as Parameters<typeof queryRoleRouteEditPoint>[0];
  assert.deepEqual(queryRoleRouteEditPoint(gl,[.08,.5]),[0,.5]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRoleVectorRoutes,clearRoleVectorRoutes} from '../src/services/mapLibreRouteLayers';
import {routeProgressIndex,splitRouteAtPosition} from '../src/services/routeProgress';

type Point=[number,number];
function fakeMap(){
  const layers=new Set<string>();
  let existing=false;
  let updates=0,creations=0;
  const source={setData:()=>{updates++;}};
  const surface={
    isStyleLoaded:()=>true,
    getSource:()=>existing?source:undefined,
    addSource:()=>{creations++;existing=true;},
    removeSource:()=>{existing=false;},
    getLayer:(id:string)=>layers.has(id)?{id}:undefined,
    addLayer:(layer:{id:string})=>{layers.add(layer.id);},
    removeLayer:(id:string)=>{layers.delete(id);}
  } as unknown as Parameters<typeof updateRoleVectorRoutes>[0];
  return {surface,get updates(){return updates;},get creations(){return creations;}};
}
test('a 150km verified path is NOT resent to MapLibre on repeated GPS samples on the same vertex',()=>{
  const path:Point[]=Array.from({length:6000},(_,i)=>[-23.5,-46.5+i*0.00025]);
  const map=fakeMap();
  const options={routePath:path,alternatives:[],modalityColor:'#2463ed',
    travelledDistanceKm:0,totalRouteKm:150,navigationMode:true,blueRoute:true};
  const first=updateRoleVectorRoutes(map.surface,{...options,userLocation:path[0]});
  assert.ok(first>=2);
  assert.equal(map.creations,1);
  assert.equal(map.updates,0);
  for(let i=0;i<100;i++)updateRoleVectorRoutes(map.surface,{
    ...options,userLocation:[path[0][0],path[0][1]+0.00000001]
  });
  assert.equal(map.updates,0,'GPS jitter must not republish thousands of road vertices');
  updateRoleVectorRoutes(map.surface,{...options,travelledDistanceKm:4,userLocation:path[160]});
  assert.equal(map.updates,1,'a genuinely progressed route must update its travelled line');
  updateRoleVectorRoutes(map.surface,{...options,travelledDistanceKm:4,userLocation:path[160]});
  assert.equal(map.updates,1);
  clearRoleVectorRoutes(map.surface);
  assert.equal(map.creations,1);
  updateRoleVectorRoutes(map.surface,{...options,userLocation:path[160]});
  assert.equal(map.creations,2,'style replacement must restore the verified source');
});
test('map progress and route split agree for circular and off-route geometry',()=>{
  const path:Point[]=[[0,0],[0,0.01],[0,0.02],[0,0.01],[0,0]];
  const index=routeProgressIndex(path,[0,0.010001],2.5,3);
  const split=splitRouteAtPosition(path,[0,0.010001],2.5,3);
  assert.ok(index!==null && index>=0,'GPS permanece associado a um trecho OSRM');
  assert.ok(Math.abs(split.travelled.at(-1)![1]-0.010001)<0.00001);
  assert.deepEqual(split.remaining[0],split.travelled.at(-1));
  assert.equal(routeProgressIndex(path,[20,30],2.5,3),null);
  assert.deepEqual(splitRouteAtPosition(path,[20,30],2.5,3),{travelled:[],remaining:path});
});

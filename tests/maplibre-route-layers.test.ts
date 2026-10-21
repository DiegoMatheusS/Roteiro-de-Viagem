import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleRouteCollection,routeZoomStroke,updateRoleVectorRoutes } from '../src/services/mapLibreRouteLayers';

type Point = [number,number];
const active: Point[] = [[-23.551,-46.632],[-23.552,-46.633],[-23.553,-46.634]];
const via: Point[] = [[-23.551,-46.632],[-23.555,-46.636],[-23.553,-46.634]];
const selected='fast';
const base = {routePath:active,alternatives:[{id:'tourist',routePath:via},{id:'fast',routePath:active}],
  selectedRouteId:selected,modalityColor:'#2563eb',travelledDistanceKm:0,
  totalRouteKm:1, navigationMode:false,blueRoute:false};
test('GeoJSON inverts Leaflet latitude/longitude for OSRM verified road paths',()=>{
  const collection=buildRoleRouteCollection(base);
  assert.equal(collection.type,'FeatureCollection');
  assert.deepEqual(collection.features.map(f=>f.properties.role),['alternative','active']);
  assert.deepEqual(collection.features[0].geometry.coordinates[0],[-46.632,-23.551]);
  assert.deepEqual(collection.features[1].geometry.coordinates[2],[-46.634,-23.553]);
});
test('real GPS progress uses a dark-blue driven line and light-blue remaining line',()=>{
  const collection=buildRoleRouteCollection({...base, navigationMode:true,
    userLocation:active[1], travelledDistanceKm:0.5});
  const roles=collection.features.map(f=>f.properties.role);
  assert.deepEqual(roles,['active','remaining','travelled']);
  assert.equal(collection.features.find(f=>f.properties.role==='remaining')?.properties.color,'#67c7ff');
  assert.equal(collection.features.find(f=>f.properties.role==='travelled')?.properties.color,'#17479b');
});
test('when GPS is off-route, no section is reported as travelled',()=>{
  const collection=buildRoleRouteCollection({...base, navigationMode:true,
    userLocation:[-24.7,-46.8], travelledDistanceKm:0.8});
  assert.equal(collection.features.some(f=>f.properties.role==='travelled'),false);
});
test('non-road or non-finite paths do not produce artificial GeoJSON lines',()=>{
  const invalid: Point[] = [[-23.5,-46.5],[Infinity,1]];
  const collection=buildRoleRouteCollection({...base,routePath:invalid,
    alternatives:[{id:'bad',routePath:invalid},{id:'fast',routePath:invalid}]});
  assert.equal(collection.features.length,0);
});
test('MapLibre draws route layers and Leaflet keeps tap areas and fallback',async()=>{
  const {readFileSync}=await import('node:fs');
  const files=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const map=files('src/components/InteractiveMap.tsx');
  assert.match(map,/updateRoleVectorRoutes\(gl/);
  assert.equal(map.includes('opacity:vectorRoutesReady ? 0.003'),false);
  assert.ok(map.includes('queryRoleVectorAlternative(gl,'));
  assert.match(map,/alternative\.on\('click',\(\)=>selectRouteRef.current\?\.\(option\.id\)\)/);
  assert.match(map,/if \(!vectorRoutesReady \|\| !vectorRoutePaintReady\) \{/);
  assert.match(map,/showRaster\(\)/);
});

test('route strokes use MapLibre zoom interpolation, retaining a white outline and distinct blue progress',()=>{
  const layers=new Map<string,{id:string;paint:Record<string,unknown>}>();
  let sourceCreated=false,uploads=0;
  const source={setData:()=>{uploads++;}};
  const gl={
    isStyleLoaded:()=>true,
    getSource:()=>sourceCreated?source:undefined,
    addSource:()=>{sourceCreated=true;},
    getLayer:(id:string)=>layers.get(id),
    addLayer:(layer:{id:string;paint:Record<string,unknown>})=>{layers.set(layer.id,layer);},
    removeLayer:(id:string)=>{layers.delete(id);}
  } as unknown as Parameters<typeof updateRoleVectorRoutes>[0];
  const road=Array.from({length:6000},(_,i)=>[-23.5,-46.5+i*0.00025] as Point);
  const options={routePath:road,alternatives:[],modalityColor:'#2563eb',
    travelledDistanceKm:0,totalRouteKm:150,navigationMode:true,blueRoute:true,
    userLocation:road[0]};
  const count=updateRoleVectorRoutes(gl,options);
  assert.ok(count>=2);
  const outline=layers.get('role-active-outline');
  const remaining=layers.get('role-remaining-line');
  const travelled=layers.get('role-travelled-line');
  assert.equal(outline?.paint['line-color'],'#ffffff');
  assert.equal(remaining?.paint['line-color'],'#67c7ff');
  assert.equal(travelled?.paint['line-color'],'#17479b');
  assert.deepEqual(outline?.paint['line-width'],routeZoomStroke(5,7.5,10));
  assert.deepEqual(remaining?.paint['line-width'],routeZoomStroke(3,5,7));
  assert.deepEqual(travelled?.paint['line-width'],routeZoomStroke(3,5,7));
  const evaluate=(expression:ReturnType<typeof routeZoomStroke>,zoom:number)=>{
    const stops=[[expression[3],expression[4]],[expression[5],expression[6]],[expression[7],expression[8]]];
    if(zoom<=stops[0][0])return stops[0][1];
    if(zoom>=stops[2][0])return stops[2][1];
    const index=zoom<=stops[1][0]?0:1;
    const [from,weight]=stops[index],[to,next]=stops[index+1];
    return weight+(next-weight)*(zoom-from)/(to-from);
  };
  const outlineStroke=outline!.paint['line-width'] as ReturnType<typeof routeZoomStroke>;
  const remainingStroke=remaining!.paint['line-width'] as ReturnType<typeof routeZoomStroke>;
  for(const zoom of [5,8,11,14,16,18]){
    assert.ok(evaluate(outlineStroke,zoom)>evaluate(remainingStroke,zoom),
      'O contorno branco precisa permanecer visível em qualquer escala');
  }
  assert.equal(evaluate(remainingStroke,5),3);
  assert.equal(evaluate(remainingStroke,11),5);
  assert.equal(evaluate(remainingStroke,16),7);
  // A mere zoom change is evaluated by MapLibre paint, not a GeoJSON upload.
  updateRoleVectorRoutes(gl,{...options,alternatives:[]});
  assert.equal(uploads,0,'Alterar a apresentação do zoom não pode reenviar 6 mil pontos');
});
test('route preview and alternative strokes also scale down at overview zoom',()=>{
  const layers=new Map<string,{id:string;paint:Record<string,unknown>}>();
  let created=false;
  const gl={
    isStyleLoaded:()=>true,getSource:()=>created?{setData:()=>{}}:undefined,
    addSource:()=>{created=true;},getLayer:(id:string)=>layers.get(id),
    addLayer:(layer:{id:string;paint:Record<string,unknown>})=>{layers.set(layer.id,layer);},
    removeLayer:(id:string)=>{layers.delete(id);}
  } as unknown as Parameters<typeof updateRoleVectorRoutes>[0];
  const primary:Point[]=[[-23.5,-46.5],[-23.6,-46.6]];
  const other:Point[]=[[-23.5,-46.5],[-23.55,-46.57],[-23.6,-46.6]];
  updateRoleVectorRoutes(gl,{
    routePath:primary,alternatives:[{id:'fast',routePath:primary},{id:'scenic',routePath:other}],
    selectedRouteId:'fast',modalityColor:'#2563eb',navigationMode:false,blueRoute:false,
    travelledDistanceKm:0,totalRouteKm:20
  });
  assert.deepEqual(layers.get('role-alternative-outline')?.paint['line-width'],routeZoomStroke(4,6,9));
  assert.deepEqual(layers.get('role-alternative-line')?.paint['line-width'],routeZoomStroke(2,4,5));
  assert.deepEqual(layers.get('role-active-line')?.paint['line-width'],routeZoomStroke(2,4,5));
  assert.equal(layers.get('role-active-line')?.paint['line-color']?.[0],'get');
});

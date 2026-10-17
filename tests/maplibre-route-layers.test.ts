import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleRouteCollection } from '../src/services/mapLibreRouteLayers';

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
  assert.match(map,/opacity:vectorRoutesReady \? 0\.003 : \.78/);
  assert.match(map,/alternative\.on\('click',\(\)=>onSelectRoute\?\.\(option\.id\)\)/);
  assert.match(map,/if \(!vectorRoutesReady\) \{/);
  assert.match(map,/showRaster\(\)/);
});

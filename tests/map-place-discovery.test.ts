import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPlaceViewport,sameMapPlaceQuery,retainedPlacesWithinBounds} from '../src/services/mapPlaceViewport';
import {bindPlaceRefresh,MAP_PLACES_REFRESH_MS} from '../src/services/placeRefresh';
import {selectRoleVectorMarkers} from '../src/services/vectorPlaceData';
import {poiVisibleAtZoom} from '../src/services/mapPoiPresentation';
import {standaloneVisiblePlaces} from '../src/services/standaloneVisiblePlaces';
import type {Place} from '../src/types/admin';

const bounds={south:-23.552,north:-23.548,west:-46.632,east:-46.628};

test('place discovery covers the camera and reuses its padded area across small GPS movements',()=>{
  const query=mapPlaceViewport(bounds,16)!;
  assert.ok(query.bounds.south<bounds.south&&query.bounds.north>bounds.north);
  assert.ok(query.bounds.west<bounds.west&&query.bounds.east>bounds.east);
  assert.ok(query.radiusKm>=1&&query.radiusKm<=120);
  assert.ok(sameMapPlaceQuery(query,mapPlaceViewport({...bounds,north:bounds.north+.00001},16)));
  const other=mapPlaceViewport({south:-22.552,north:-22.548,west:-45.632,east:-45.628},16)!;
  assert.ok(!sameMapPlaceQuery(query,other));
  assert.ok(other.points[0][0]>-23,'a long route cannot pin discovery to its original town');
  assert.equal(mapPlaceViewport(bounds,8),null);
  assert.equal(mapPlaceViewport({...bounds,south:NaN},15),null);
  assert.equal(mapPlaceViewport({...bounds,north:95},15),null);
  assert.equal(mapPlaceViewport({south:-40,north:40,west:-50,east:-45},10),null);
  const crossing=mapPlaceViewport({south:-1,north:1,west:179,east:-179},9)!;
  assert.ok(crossing.bounds.west>crossing.bounds.east);
  assert.ok(Math.abs(crossing.points[0][1])>179);
  const wrapped=mapPlaceViewport({south:-1,north:1,west:181,east:182},9)!;
  assert.ok(wrapped.bounds.west<0&&wrapped.bounds.east<0,'MapLibre world copies wrap into valid API coordinates');
});

test('registered businesses and tolls stay visible in overview and active navigation without fake prices',()=>{
  const base:Place={id:'osm:node:1',name:'Shopping cadastrado',kind:'shopping',lat:-23.55,lng:-46.63,
    address:'São Paulo, SP',sourceUrl:'https://www.openstreetmap.org/node/1',description:'',website:'',phone:'',active:true,managed:true};
  for(const navigationMode of [false,true]){
    const markers=selectRoleVectorMarkers({stations:[],tolls:[],navigationMode,
      places:[base,{...base,id:'toll',kind:'toll'},{...base,id:'disabled',active:false}]});
    assert.equal(markers.length,2);
    assert.ok(markers.every(marker=>poiVisibleAtZoom(marker,10)));
    assert.equal(markers.find(marker=>marker.kind==='toll')?.priceLabel,null);
    const list=standaloneVisiblePlaces({markers,stations:[],places:[base],stops:[],center:[-23.55,-46.63],contains:()=>true,zoom:10});
    assert.equal(list.length,1,'same name at the same point is still deduplicated');
  }
  const imported=selectRoleVectorMarkers({stations:[],tolls:[],navigationMode:false,places:[{...base,managed:false} ]})[0];
  assert.equal(poiVisibleAtZoom(imported,10),true,'zoom does not hide a loaded POI');
  assert.equal(standaloneVisiblePlaces({markers:[imported],stations:[],places:[],stops:[],center:[-23.55,-46.63],contains:()=>true,zoom:10}).length,1);
});

test('open maps refresh catalog changes, pause in the background and coalesce Android resume events',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const doc=Object.assign(new EventTarget(),{hidden:false});
  const win=Object.assign(new EventTarget(),{navigator:{onLine:true}});
  let calls=0,paused=0;
  const stop=bindPlaceRefresh(doc,win,()=>calls++,()=>paused++);
  t.mock.timers.tick(MAP_PLACES_REFRESH_MS-1);assert.equal(calls,0);
  t.mock.timers.tick(1);assert.equal(calls,1);
  win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('pageshow'));
  t.mock.timers.tick(199);assert.equal(calls,1);
  t.mock.timers.tick(1);assert.equal(calls,2);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(paused,1);t.mock.timers.tick(90000);assert.equal(calls,2);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('focus'));t.mock.timers.tick(200);assert.equal(calls,3);
  win.navigator.onLine=false;win.dispatchEvent(new Event('offline'));
  t.mock.timers.tick(90000);assert.equal(calls,3);
  win.navigator.onLine=true;win.dispatchEvent(new Event('online'));
  t.mock.timers.tick(200);assert.equal(calls,4);
  stop();win.dispatchEvent(new Event('focus'));t.mock.timers.tick(90000);assert.equal(calls,4);
});

test('registered fuel pins use fresh catalog positions even when provider discovery is cached',()=>{
  const station={id:'osm:node:501',name:'Nome antigo',lat:-24,lng:-47,address:'Endereço',
    source:'OpenStreetMap' as const,sourceUrl:'https://www.openstreetmap.org/node/501',
    mapUpdatedAt:new Date().toISOString(),prices:[],managed:true};
  const fresh:Place={...station,name:'Posto atualizado',lat:-23.55,lng:-46.63,kind:'fuel',
    active:true,managed:true,description:'',website:'',phone:''};
  const input={stations:[station],places:[fresh],tolls:[],navigationMode:true,viewportScopedPlaces:true};
  const pins=selectRoleVectorMarkers(input);
  assert.equal(pins.length,1);
  assert.equal(pins[0].kind,'fuel');assert.equal(pins[0].name,fresh.name);
  assert.deepEqual(pins[0].coords,[fresh.lat,fresh.lng]);
  assert.equal(selectRoleVectorMarkers({...input,stations:[]}).length,1,'new fuel registrations do not wait for the external provider');
  assert.equal(selectRoleVectorMarkers({...input,places:[]}).length,0,'removed or out-of-view managed stations do not survive through the provider cache');
});

test('zoom changes retain in-view POIs but not another city or deactivated entries',()=>{
 const data=[{id:'near',lat:-23.55,lng:-46.63,active:true},
  {id:'far',lat:-23.4,lng:-46.5,active:true},
  {id:'inactive',lat:-23.55,lng:-46.63,active:false}];
 const smaller={south:-23.56,north:-23.54,west:-46.64,east:-46.62};
 assert.deepEqual(retainedPlacesWithinBounds(data,smaller).map(p=>p.id),['near']);
 assert.deepEqual(retainedPlacesWithinBounds(data,{south:-23.41,north:-23.39,west:-46.51,east:-46.49}).map(p=>p.id),['far']);
 assert.deepEqual(retainedPlacesWithinBounds(data,undefined),[]);
 assert.deepEqual(retainedPlacesWithinBounds([
  {id:'west',lat:0,lng:-179.8},{id:'east',lat:0,lng:179.8},
  {id:'unrelated',lat:0,lng:0}
 ],{south:-1,north:1,west:179.6,east:-179.6}).map(p=>p.id),['west','east']);
});

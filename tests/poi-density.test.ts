import test from 'node:test';
import assert from 'node:assert/strict';
import {poiDensity,selectVisiblePois} from '../src/services/poiDensity';
import {rolePlaceMarkerKey,type RoleVectorMarker} from '../src/services/vectorPlaceData';
import {standaloneVisiblePlaces} from '../src/services/standaloneVisiblePlaces';

const entry=(id:string,x:number,y:number,category:'square'|'landmark'|'park'='square'):RoleVectorMarker=>
  ({kind:'place',id,name:id,category,coords:[x,y]});
const project=([x,y]:[number,number])=>({x,y});
const view={zoom:10,width:420,height:850,project};
const dense=Array.from({length:500},(_,i)=>entry(String(i),(i%20)*20+10,Math.floor(i/20)*30+10));
test('zoomed out city shows a bounded set of separated smaller icons; zooming in reveals more',()=>{
  const far=selectVisiblePois(dense,view),close=selectVisiblePois(dense,{...view,zoom:18});
  assert.ok(far.keys.size>0&&far.keys.size<=8);assert.ok(close.keys.size>far.keys.size);
  assert.equal(far.size,26);assert.equal(close.size,38);
  for(const layout of [far,close]){
    const shown=dense.filter(item=>layout.keys.has(rolePlaceMarkerKey(item)));
    for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++)
      assert.ok(Math.hypot(shown[i].coords[0]-shown[j].coords[0],shown[i].coords[1]-shown[j].coords[1])>=layout.gap);
  }
  assert.deepEqual(selectVisiblePois([...dense].reverse(),view).keys,far.keys,'provider ordering cannot swap representatives');
});
test('landmarks and explicit route services win collisions; selected pin remains at its exact location',()=>{
  const square=entry('square',200,400),landmark=entry('landmark',201,400,'landmark');
  assert.deepEqual([...selectVisiblePois([square,landmark],view).keys],['place:landmark']);
  const selected=selectVisiblePois([square,landmark],{...view,selectedKey:'place:square'});
  assert.deepEqual([...selected.keys],['place:square']);
  const fuel:RoleVectorMarker={kind:'fuel',id:'fuel',coords:[202,400],name:'Posto',priceLabel:null,routeService:true};
  assert.deepEqual([...selectVisiblePois([landmark,fuel],{...view,showRouteServices:true}).keys],['fuel:fuel']);
  assert.deepEqual([...selectVisiblePois([landmark,fuel],{...view,navigationMode:true}).keys],['fuel:fuel']);
  assert.deepEqual(square.coords,[200,400]);
});
test('offscreen/invalid projections do not consume the budget and actual screen dimensions control it',()=>{
  assert.equal(selectVisiblePois([entry('left',-1,100),entry('bottom',200,900),entry('bad',NaN,2)],view).keys.size,0);
  assert.equal(selectVisiblePois(dense,{...view,width:0}).keys.size,0);
  assert.equal(selectVisiblePois(dense,{...view,zoom:NaN}).keys.size,0);
  assert.ok(poiDensity(14,420,850).limit<poiDensity(14,1400,900).limit||poiDensity(14,1400,900).limit===20);
  const layout=selectVisiblePois(dense,{...view,project:([x,y])=>({x:420-y/3,y:x*1.5})});
  assert.ok(layout.keys.size<=layout.limit,'rotation/tilt projections keep the same screen budget');
});
test('nearby list still lets the user find places whose icon is hidden by density',()=>{
  const markers=[entry('hidden',0,0),entry('shown',0,1)];
  assert.equal(selectVisiblePois(markers,view).keys.size,1);
  const places=standaloneVisiblePlaces({markers,stations:[],places:[],stops:[],
    center:[0,0],contains:()=>true,zoom:10});
  assert.deepEqual(places.map(place=>place.id),['hidden','shown']);
});

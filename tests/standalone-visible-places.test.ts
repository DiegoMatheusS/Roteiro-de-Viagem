import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneVisiblePlaces} from '../src/services/standaloneVisiblePlaces';
import type {RoleVectorMarker} from '../src/services/vectorPlaceData';
import type {RouteStop} from '../src/types';
const marker=(id:string,lat=0):RoleVectorMarker=>({kind:'place',id,name:id,category:'viewpoint',coords:[lat,0]});
const stop:RouteStop={id:'stop-1',name:'Parada real',category:'mirante',lat:0.001,lng:0,description:'Endereço real',recommendedMinutes:10};
const input={markers:[marker('real'),marker('fora',10)],stations:[],places:[],stops:[stop],
  center:[0,0] as [number,number],contains:([lat]:[number,number])=>Math.abs(lat)<1};

test('only installed markers and valid route stops inside viewport enter the list',()=>{
  const visible=standaloneVisiblePlaces(input);
  assert.deepEqual(visible.map(item=>item.name),['real','Parada real']);
  assert.ok(visible[1].id.startsWith('stop:'));
  assert.equal(visible[1].address,'Endereço real');
  const hidden=standaloneVisiblePlaces({...input,markers:[],stops:[{...stop,category:'posto',type:undefined}]});
  assert.deepEqual(hidden,[]);
});
test('repeated names at the same coordinate are deduplicated; nearest 25 remain',()=>{
  const markers=[marker('duplicate'),{...marker('duplicate'),id:'second'},
    ...Array.from({length:30},(_,index)=>marker('p'+index,(index+1)*0.001))];
  const visible=standaloneVisiblePlaces({...input,markers,stops:[]});
  assert.equal(visible.length,25);
  assert.equal(visible[0].id,'duplicate');
  assert.equal(visible.at(-1)?.id,'p23');
});
test('malformed coordinates cannot reach the native bounds check',()=>{
  const seen:number[]=[];
  const visible=standaloneVisiblePlaces({...input,markers:[marker('invalid',NaN),marker('real')],stops:[],
    contains:([lat])=>{seen.push(lat);return true;}});
  assert.deepEqual(visible.map(item=>item.id),['real']);
  assert.deepEqual(seen,[0]);
});

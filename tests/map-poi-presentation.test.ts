import test from 'node:test';
import assert from 'node:assert/strict';
import {poiAccent,poiVisibleAtZoom,poiDistanceMeters,nearestPoiToExpand} from '../src/services/mapPoiPresentation';
import type {RoleVectorMarker} from '../src/services/vectorPlaceData';

const place=(id:string,coords:[number,number],category:'restaurant'|'waterfall'='restaurant'):RoleVectorMarker=>
 ({kind:'place',id,coords,name:id,description:'Local cadastrado',category});
test('cores por categoria e zoom progressivo evitam poluição visual',()=>{
 assert.equal(poiAccent('fuel'),'#2563eb');
 assert.equal(poiAccent('hotel'),'#7c3aed');
 assert.equal(poiAccent('waterfall'),'#15803d');
 assert.equal(poiVisibleAtZoom(place('turismo',[-23,-46],'waterfall'),11),true);
 assert.equal(poiVisibleAtZoom(place('resto',[-23,-46]),11),false);
 assert.equal(poiVisibleAtZoom(place('resto',[-23,-46]),14),true);
 assert.equal(poiVisibleAtZoom({kind:'fuel',id:'1',name:'Posto',coords:[-23,-46],priceLabel:null},14),false);
});
test('apenas o local mais perto abre quando o GPS é confiável',()=>{
 const pins=[place('a',[-23,-46]),place('b',[-23.0005,-46])];
 const input={zoom:16,navigationMode:true,location:[-23,-46] as [number,number],accuracyMeters:8};
 assert.equal(nearestPoiToExpand(pins,input),'place:a');
 assert.equal(nearestPoiToExpand(pins,{...input,accuracyMeters:70}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,zoom:12}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,navigationMode:false}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,location:[-24,-47]}),null);
 assert.ok(poiDistanceMeters([-23,-46],[-23.0005,-46])>50);
});

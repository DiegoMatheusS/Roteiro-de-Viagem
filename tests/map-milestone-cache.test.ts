import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRoleVectorMilestones,clearRoleVectorMilestones} from '../src/services/mapLibreRouteMilestones';

test('marcos da rota não reenviam GeoJSON quando apenas GPS muda',()=>{
  let uploads=0,creates=0,paints=0;
  const sources=new Map<string,{setData:(data:unknown)=>void}>();
  const layers=new Set<string>();
  const map={
    isStyleLoaded:()=>true,
    getSource:(id:string)=>sources.get(id),
    getLayer:(id:string)=>layers.has(id)?{}:undefined,
    addSource:(id:string)=>{creates++;sources.set(id,{setData:()=>{uploads++;}});},
    addLayer:(layer:{id:string})=>{layers.add(layer.id);},
    setPaintProperty:()=>{paints++;},
    removeLayer:(id:string)=>{layers.delete(id);},
    removeSource:(id:string)=>{sources.delete(id);}
  };
  const route:[[number,number],[number,number]]=[[-23.5,-46.6],[-23.6,-46.7]];
  assert.equal(updateRoleVectorMilestones(map as never,route,'#2563eb',true)>=0,true);
  updateRoleVectorMilestones(map as never,route,'#2563eb',true);
  assert.equal(creates,1);
  assert.equal(uploads,0,'GPS render cannot resend unchanged decoration');
  updateRoleVectorMilestones(map as never,route,'#059669',true);
  assert.equal(uploads,0,'color-only change updates paint, not geometry');
  assert.equal(paints,1);
  updateRoleVectorMilestones(map as never,route,'#059669',false);
  assert.equal(uploads,1,'hiding milestones clears geometry');
  clearRoleVectorMilestones(map as never);
  updateRoleVectorMilestones(map as never,route,'#2563eb',true);
  assert.equal(creates,2,'style resources can be recreated after clearing');
});

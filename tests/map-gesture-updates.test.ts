import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapGestureUpdates,type MapUpdateClock} from '../src/services/mapGestureUpdates';

function setup(){
  const timers=new Map<number,()=>void>();
  let id=0,latest=0;
  const rendered:number[]=[];
  const clock:MapUpdateClock={
    set(callback,delay){assert.equal(delay,160);timers.set(++id,callback);return id;},
    clear(handle){timers.delete(handle as number);}
  };
  const updates=createMapGestureUpdates(()=>rendered.push(latest),{clock});
  return {updates,rendered,timers,
    change(value:number){latest=value;updates.request();},
    settle(){for(const [key,run] of timers){timers.delete(key);run();}}};
}

test('GPS/data renders wait for the gesture and publish only the latest state after settling',()=>{
  const s=setup();
  s.change(1);
  s.updates.hold();
  for(let i=2;i<=100;i++)s.change(i);
  s.settle();
  assert.deepEqual(s.rendered,[1],'holding the screen does no map refresh work');
  s.updates.release();
  s.change(101);
  assert.equal(s.updates.paused(),true,'also defer updates during the quiet period');
  assert.deepEqual(s.rendered,[1]);
  s.settle();
  assert.deepEqual(s.rendered,[1,101],'never replay stale GPS or route snapshots');
  assert.equal(s.updates.paused(),false);
  s.change(102);
  assert.deepEqual(s.rendered,[1,101,102],'normal navigation stays live when untouched');
});

test('another gesture cancels the queued refresh until the map settles again',()=>{
  const s=setup();
  s.updates.hold();s.change(1);s.updates.release();
  s.updates.hold();s.change(2);s.settle();
  assert.deepEqual(s.rendered,[]);
  assert.equal(s.timers.size,0);
  s.updates.release();s.settle();
  assert.deepEqual(s.rendered,[2]);
});

test('leaving the map cancels pending work and later GPS notifications',()=>{
  const s=setup();
  s.updates.hold();s.change(1);s.updates.release();
  s.updates.dispose();s.settle();s.change(2);s.updates.release();
  assert.deepEqual(s.rendered,[]);
  assert.equal(s.timers.size,0);
});

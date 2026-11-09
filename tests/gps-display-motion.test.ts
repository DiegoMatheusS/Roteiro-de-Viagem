import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpsDisplayMotion,type GpsDisplayInput,type GpsFrameClock} from '../src/services/gpsDisplayMotion';
import {createStandaloneMapLibreCameraPort,createHybridCameraPort} from '../src/services/mapCameraController';
import {navigationRoadHeading} from '../src/services/navigationRoadHeading';
import type {CameraPoint} from '../src/services/mapCameraController';

function fixture(){
  let now=0,id=0;
  const pending=new Map<number,()=>void>(),paints:CameraPoint[]=[];
  const clock:GpsFrameClock={now:()=>now,request:callback=>{pending.set(++id,callback);return id;},cancel:key=>{pending.delete(key);}};
  const motion=createGpsDisplayMotion(point=>paints.push(point),clock);
  const update=(latitude:number,timestamp=now,extra:Partial<GpsDisplayInput>={})=>motion.update({
    position:[latitude,-46.63],timestamp,speedMetersPerSecond:10,enabled:true,reducedMotion:false,...extra});
  const advance=(ms:number)=>{
    const end=now+ms;
    while(now<end){now=Math.min(end,now+16);const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback());}
  };
  return {motion,update,advance,paints,pending};
}
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ~= ${expected}`);

test('one-second fixes yield many monotonic frames and never extrapolate beyond the last real fix',()=>{
  const f=fixture();f.update(-23.55);f.advance(1000);
  assert.equal(f.update(-23.5499).durationMs,1000);f.advance(500);
  close(f.motion.snapshot().position![0],-23.54995);f.advance(500);
  assert.ok(f.paints.length>50);
  for(let i=1;i<f.paints.length;i++)assert.ok(f.paints[i][0]>=f.paints[i-1][0]);
  close(f.paints.at(-1)![0],-23.5499);assert.equal(f.pending.size,0);
  f.advance(5000);close(f.motion.snapshot().position![0],-23.5499);
});
test('compass rerenders and duplicate fixes preserve the trajectory deadline',()=>{
  const f=fixture();f.update(-23.55,10000);f.advance(1000);f.update(-23.5499,11000);f.advance(400);
  assert.equal(f.update(-23.5499,11000).durationMs,600);f.advance(600);
  close(f.motion.snapshot().position![0],-23.5499);assert.equal(f.pending.size,0);
});
test('a new fix before the previous animation ends continues at the displayed point',()=>{
  const f=fixture();f.update(-23.55,10000);f.advance(1000);f.update(-23.5499,11000);f.advance(400);
  const previous=f.motion.snapshot().position!;const next=f.update(-23.5498,12000);
  assert.deepEqual(next.position,previous);assert.equal(next.durationMs,1000);assert.equal(f.pending.size,1);
  f.advance(1000);close(f.motion.snapshot().position![0],-23.5498);
});
test('750 ms and two-second fixes use native timestamps instead of compass polling cadence',()=>{
  const f=fixture();f.update(-23.55,10000);f.advance(250);f.update(-23.55,10000);
  f.advance(250);f.update(-23.55,10000);f.advance(250);
  assert.equal(f.update(-23.5499,10750).durationMs,750);
  f.advance(2000);assert.equal(f.update(-23.5498,12750).durationMs,2000);
  f.motion.destroy();assert.equal(f.pending.size,0);
});
test('missing timestamps still animate while repeated renders do not reset cadence',()=>{
  const f=fixture();f.update(-23.55,undefined,{timestamp:undefined});f.advance(1000);
  f.update(-23.5499,undefined,{timestamp:undefined});f.advance(300);
  assert.equal(f.update(-23.5499,undefined,{timestamp:undefined}).durationMs,700);f.motion.destroy();
});
test('stationary GPS accuracy jitter is suppressed; real movement resumes from the anchor',()=>{
  const f=fixture();f.update(-23.55,0,{speedMetersPerSecond:0,accuracyMeters:8});f.advance(1000);
  const drift=f.update(-23.54995,1000,{speedMetersPerSecond:0,accuracyMeters:8});
  close(drift.position![0],-23.55);close(drift.target![0],-23.55);f.advance(1000);
  const moving=f.update(-23.5498,2000);close(moving.position![0],-23.55);assert.equal(moving.durationMs,1000);f.motion.destroy();
});
test('walking and slow driving keep moving smoothly through fixes less than one meter apart',()=>{
  const f=fixture();f.update(-23.55,0,{speedMetersPerSecond:1});f.advance(750);
  const slow=f.update(-23.549993,750,{speedMetersPerSecond:1});
  assert.equal(slow.durationMs,750);f.advance(375);
  close(f.motion.snapshot().position![0],-23.5499965);
  f.advance(375);close(f.motion.snapshot().position![0],-23.549993);
});
test('stopping reaches the final verified fix and subsequent noise cannot move it',()=>{
  const f=fixture();f.update(-23.55);f.advance(1000);f.update(-23.5499);f.advance(500);
  f.update(-23.54985,1500,{speedMetersPerSecond:0});f.advance(500);
  close(f.motion.snapshot().position![0],-23.54985);f.advance(1000);
  f.update(-23.5498,3000,{speedMetersPerSecond:0});close(f.motion.snapshot().target![0],-23.54985);
});
test('signal loss cancels animation; reacquisition and large relocations snap without a false drive',()=>{
  const f=fixture();f.update(-23.55);f.advance(1000);f.update(-23.5499);f.advance(400);
  assert.deepEqual(f.motion.update({enabled:true,reducedMotion:false}),{durationMs:0});assert.equal(f.pending.size,0);
  assert.equal(f.update(-23.5498).durationMs,0);f.advance(1000);
  const jump=f.update(-23.54);assert.equal(jump.durationMs,0);close(jump.position![0],-23.54);
  f.advance(5000);assert.equal(f.update(-23.5399).durationMs,0);
});
test('out-of-order and invalid fixes cannot rewind or poison a trajectory',()=>{
  const f=fixture();f.update(-23.55,10000);f.advance(1000);f.update(-23.5499,11000);f.advance(500);
  const state=f.motion.snapshot();assert.deepEqual(f.update(-23.56,10500),state);
  assert.equal(f.update(NaN,12000).position,undefined);assert.equal(f.pending.size,0);
  assert.equal(f.update(91,13000).position,undefined);
});
test('reduced motion, non-navigation maps and disposal release all animation work',()=>{
  const f=fixture();f.update(-23.55);f.advance(1000);f.update(-23.5499);f.advance(500);
  const reduced=f.update(-23.5499,1000,{reducedMotion:true});close(reduced.position![0],-23.5499);
  assert.equal(reduced.durationMs,0);assert.equal(f.pending.size,0);f.advance(1000);
  assert.equal(f.update(-23.5498,2000,{enabled:false}).durationMs,0);f.advance(1000);
  f.update(-23.5497,3000);f.motion.destroy();assert.equal(f.pending.size,0);
  const count=f.paints.length;f.advance(5000);f.update(-23.5,9000);assert.equal(f.paints.length,count);
});
test('camera and marker share linear timing; heading updates preserve arrival time',()=>{
  const f=fixture();f.update(-23.55);f.advance(1000);
  const calls:Array<{duration:number;easeId?:string;easing?:(t:number)=>number}>=[];
  const camera=createStandaloneMapLibreCameraPort({stop(){},getZoom:()=>18.5,jumpTo(){},fitBounds(){},easeTo:options=>calls.push(options)},()=>90);
  const first=f.update(-23.5499);camera.follow(first.target!,false,first.durationMs);
  f.advance(350);const heading=f.motion.snapshot();camera.follow(heading.target!,false,heading.durationMs);
  assert.equal(calls[0].duration,1000);assert.equal(calls[1].duration,650);assert.equal(calls[0].easeId,calls[1].easeId);
  assert.equal(calls[0].easing!(.2),.2);assert.equal(calls[1].easing!(.8),.8);f.motion.destroy();
});
test('fallback snaps zero-duration fixes instead of Leaflet interpreting zero as its default animation',()=>{
  const options:unknown[]=[];
  const camera=createHybridCameraPort({getZoom:()=>18.5,stop(){},setView(){},fitBounds(){},flyTo(){},
    panTo:(_point,value)=>{options.push(value);}});
  camera.follow([-23.55,-46.63],false,0);assert.deepEqual(options,[{animate:false}]);
});

const road:CameraPoint[]=[[-23.55,-46.63],[-23.5496,-46.63],[-23.5496,-46.6285]];
test('road bearing follows the current street and changes at the corner, not twenty meters later',()=>{
  close(navigationRoadHeading(road,[-23.5497,-46.63],90,10,6)!,0);
  close(navigationRoadHeading(road,[-23.5496,-46.62998],0,10,6)!,90);
  close(navigationRoadHeading(road,[-23.5496,-46.6299],90,0,6)!,90);
});
test('off-route GPS uses real movement course rather than an unrelated street or the phone compass',()=>{
  assert.equal(navigationRoadHeading(road,[-23.551,-46.631],245,10,6),245);
  assert.equal(navigationRoadHeading([],[-23.55,-46.63],220,0,6),null);
  assert.equal(navigationRoadHeading(road,[-23.5498,-46.63],180,10,6),180,'real turnaround faces the direction driven');
});
test('a verified street turn rotates the display gradually while preserving the same GPS timing',()=>{
  const f=fixture();f.update(-23.5497,10000,{routePath:road,headingDegrees:0});f.advance(1000);
  const turn=f.update(-23.5496,11000,{position:[-23.5496,-46.6299],routePath:road,headingDegrees:90});
  close(turn.headingDegrees!,0);close(turn.targetHeadingDegrees!,90);f.advance(500);
  close(f.motion.snapshot().headingDegrees!,45);f.advance(500);close(f.motion.snapshot().headingDegrees!,90);
});
test('north wrap takes the short turn and stationary GPS noise cannot rotate the arrow',()=>{
  const f=fixture();f.update(-23.55,10000,{headingDegrees:359});f.advance(1000);
  f.update(-23.5499,11000,{headingDegrees:1});f.advance(500);
  close(f.motion.snapshot().headingDegrees!,0);f.advance(500);
  f.update(-23.5499,12000,{headingDegrees:230,speedMetersPerSecond:0});f.advance(1000);
  close(f.motion.snapshot().headingDegrees!,1);f.motion.destroy();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateMapCourse} from '../src/services/gpsHeading';
import {createStandaloneMapLibreCameraPort,type CameraPort} from '../src/services/mapCameraController';
import {createNavigationCameraSession} from '../src/services/navigationCameraSession';

test('course keeps last reliable direction when stopped or GPS heading is missing',()=>{
  assert.equal(updateMapCourse(null,null,10),null);
  assert.equal(updateMapCourse(null,90,10),90);
  for(const value of [undefined,NaN,Infinity,-1,360])assert.equal(updateMapCourse(90,value,10),90);
  assert.equal(updateMapCourse(90,180,0),90);
  assert.equal(updateMapCourse(90,180,1),90);
  assert.equal(updateMapCourse(90,180,2),180);
  assert.equal(updateMapCourse(359,1,10),361);
  assert.equal(updateMapCourse(1,359,10),-1);
});

test('bearing and GPS position use a single native camera command and honor reduced motion',()=>{
  const calls:unknown[]=[];
  let bearing=90;
  const camera=createStandaloneMapLibreCameraPort({
    getZoom:()=>17,stop:()=>{},fitBounds:()=>{},
    easeTo:options=>{calls.push(['easeTo',options]);},
    jumpTo:options=>{calls.push(['jumpTo',options]);}
  },()=>bearing);
  camera.follow([-23.55,-46.63],false);
  camera.recenter([-23.55,-46.63],true,true);
  bearing=0;
  camera.follow([-23.55,-46.63],true);
  assert.deepEqual(calls,[
    ['easeTo',{center:[-46.63,-23.55],duration:450,bearing:90}],
    ['jumpTo',{center:[-46.63,-23.55],zoom:17,bearing:90}],
    ['jumpTo',{center:[-46.63,-23.55],bearing:0}]
  ]);
});

test('heading-only updates turn while following and remain paused during exploration',()=>{
  const moves:string[]=[];
  const camera:CameraPort={zoom:()=>16,stop:()=>{moves.push('stop');},
    firstGpsFix:()=>{moves.push('first');},focus:()=>{},fitRoute:()=>{},
    follow:()=>{moves.push('follow');},recenter:()=>{moves.push('recenter');}};
  const session=createNavigationCameraSession(camera,()=>{});
  const input={navigationMode:true,followUser:true,position:[-23.55,-46.63] as [number,number],
    centerRequest:0,reducedMotion:false,bearing:0};
  session.update(input);
  session.update({...input,bearing:90});
  assert.deepEqual(moves,['first','follow']);
  session.explore();
  session.update({...input,bearing:180});
  assert.deepEqual(moves,['first','follow','stop']);
  session.update({...input,bearing:180,centerRequest:1});
  assert.deepEqual(moves,['first','follow','stop','recenter']);
});

test('course control starts north and GPS arrow stays aligned with the rotated map',()=>{
  const map=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
  const pins=readFileSync(new URL('../src/services/mapLibreNavigationPins.ts',import.meta.url),'utf8');
  assert.match(map,/\[courseMode,setCourseMode\]=useState\(false\)/);
  assert.match(map,/bearing=p.navigationMode&&courseModeRef.current\?\(course\?\?0\):0/);
  assert.match(pins,/rotationAlignment:kind==='live'\?'map':'viewport'/);
});


test('new route bounds retain selected course instead of resetting bearing to north',()=>{
  let received:unknown;
  const camera=createStandaloneMapLibreCameraPort({
    getZoom:()=>16,stop:()=>{},jumpTo:()=>{},easeTo:()=>{},
    fitBounds:(_bounds,options)=>{received=options;}
  },()=>90);
  camera.fitRoute([[-23.55,-46.63],[-23.56,-46.62]],{
    topLeft:[36,70],bottomRight:[36,64],maxZoom:13
  });
  assert.deepEqual(received,{padding:{top:70,left:36,bottom:64,right:36},maxZoom:13,duration:0,bearing:90});
});

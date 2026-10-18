import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationCameraSession} from '../src/services/navigationCameraSession';
import type {CameraPort,CameraMode} from '../src/services/mapCameraController';

function setup(){
  const calls:string[]=[];
  const modes:CameraMode[]=[];
  const camera:CameraPort={zoom:()=>17,stop:()=>{calls.push('stop');},
    firstGpsFix:()=>{calls.push('first');},focus:()=>{},fitRoute:()=>{},
    recenter:()=>{calls.push('recenter');},follow:()=>{calls.push('follow');}};
  const session=createNavigationCameraSession(camera,mode=>modes.push(mode));
  return {session,calls,modes};
}
const input={navigationMode:true,followUser:true,position:[-23.5,-46.6] as [number,number],centerRequest:0,reducedMotion:false};

test('native gestures interrupt movement; subsequent GPS fixes cannot steal exploration',()=>{
  const s=setup();
  s.session.update(input);
  s.session.update({...input,position:[-23.501,-46.6]});
  s.session.explore();s.session.explore();
  s.session.update({...input,position:[-23.502,-46.6]});
  assert.deepEqual(s.calls,['first','follow','stop','stop']);
  assert.deepEqual(s.modes,['exploring']);
  s.session.update({...input,position:[-23.502,-46.6],centerRequest:1});
  s.session.update({...input,position:[-23.503,-46.6],centerRequest:1});
  assert.deepEqual(s.calls,['first','follow','stop','stop','recenter','follow']);
  assert.deepEqual(s.modes,['exploring','following']);
});

test('pending GPS recenter survives missing location; tiny or invalid fixes do not move camera',()=>{
  const s=setup();
  s.session.update({...input,position:undefined,centerRequest:1});
  s.session.update({...input,centerRequest:1});
  s.session.update({...input,centerRequest:1,position:[-23.500001,-46.6]});
  s.session.update({...input,centerRequest:1,position:[Infinity,0]});
  assert.deepEqual(s.calls,['recenter']);
  s.session.update({...input,centerRequest:1,followUser:false,position:[-23.51,-46.6]});
  assert.deepEqual(s.calls,['recenter']);
});

test('leaving navigation resets exploration and does not create a second camera owner',()=>{
  const s=setup();s.session.update(input);s.session.explore();
  s.session.update({...input,navigationMode:false});
  s.session.update(input);
  assert.deepEqual(s.calls,['first','stop','first']);
  assert.deepEqual(s.modes,['exploring','following']);
});


test('home map recenters only on request and never follows GPS automatically',()=>{
  const s=setup();
  const home={...input,navigationMode:false};
  s.session.update(home);
  s.session.update({...home,position:[-23.51,-46.6]});
  assert.deepEqual(s.calls,[]);
  s.session.update({...home,centerRequest:1,position:undefined});
  s.session.update({...home,centerRequest:1});
  assert.deepEqual(s.calls,['recenter']);
  s.session.update({...home,centerRequest:1,position:[-23.52,-46.6]});
  assert.deepEqual(s.calls,['recenter']);
  assert.deepEqual(s.modes,[]);
});

test('fallback snapshot records only commands and GPS fixes actually consumed',()=>{
  const s=setup();
  s.session.update({...input,position:undefined,centerRequest:2});
  assert.deepEqual(s.session.snapshot(),{mode:'following',centerRequest:0,position:null});
  s.session.update({...input,centerRequest:2});s.session.explore();
  const snapshot=s.session.snapshot();
  assert.deepEqual(snapshot,{mode:'exploring',centerRequest:2,position:input.position});
  snapshot.position![0]=0;
  assert.deepEqual(s.session.snapshot().position,input.position);
  s.session.update({...input,centerRequest:3});
  assert.equal(s.session.snapshot().mode,'following');
});

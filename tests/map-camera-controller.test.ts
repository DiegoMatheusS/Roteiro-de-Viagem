import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHybridCameraPort,createStandaloneMapLibreCameraPort,nextCameraMode,recenterZoom} from '../src/services/mapCameraController';

test('camera mode is deterministic: gestures pause, GPS resumes and trip exit resets',()=>{
  assert.equal(nextCameraMode('following','drag'),'exploring');
  assert.equal(nextCameraMode('exploring','recenter'),'following');
  assert.equal(nextCameraMode('exploring','stop'),'following');
  assert.equal(nextCameraMode('following','recenter'),'following');
});
test('recenter respects chosen navigation zoom and establishes useful zoom from broad map',()=>{
  assert.equal(recenterZoom(17,true),17);
  assert.equal(recenterZoom(11,true),11);
  assert.equal(recenterZoom(4,true),15);
  assert.equal(recenterZoom(19,false),15);
  assert.equal(recenterZoom(NaN,true),15);
  assert.equal(recenterZoom(22,true),19);
});
test('hybrid controller uses only Leaflet camera commands and supports reduced motion',()=>{
  const calls:Array<{name:string;args:unknown[]}>=[];
  const surface={
    getZoom:()=>17,
    setView:(...args:[unknown,...unknown[]])=>calls.push({name:'setView',args}),
    flyTo:(...args:[unknown,...unknown[]])=>calls.push({name:'flyTo',args}),
    panTo:(...args:[unknown,...unknown[]])=>calls.push({name:'panTo',args})
  };
  const controller=createHybridCameraPort(surface);
  controller.recenter([-23.5,-46.6],true,false);
  controller.follow([-23.6,-46.7],false);
  controller.follow([-23.7,-46.8],true);
  controller.recenter([-23.5,-46.6],false,true);
  assert.deepEqual(calls.map(x=>x.name),['flyTo','panTo','panTo','setView']);
  assert.deepEqual(calls[0].args[1],17);
  assert.deepEqual(calls[1].args[1],{animate:true,duration:0.45,easeLinearity:0.3});
  assert.deepEqual(calls[2].args[1],{animate:false});
  assert.deepEqual(calls[3].args[1],15);
});
test('standalone MapLibre adapter uses correct longitude/latitude only when explicitly selected',()=>{
  const calls:Array<{name:string;options:unknown}>=[];
  const controller=createStandaloneMapLibreCameraPort({
    getZoom:()=>16,
    jumpTo:(options)=>calls.push({name:'jumpTo',options}),
    easeTo:(options)=>calls.push({name:'easeTo',options})
  });
  controller.recenter([-23.5,-46.6],true,false);
  controller.follow([-23.55,-46.63],true);
  assert.deepEqual(calls,[
    {name:'easeTo',options:{center:[-46.6,-23.5],zoom:16,duration:550}},
    {name:'jumpTo',options:{center:[-46.63,-23.55]}}
  ]);
});
test('hybrid map only issues camera moves through the Leaflet port; drag shows visible follow action',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../src/components/ActiveTripModal.tsx',import.meta.url),'utf8');
  const bridge=readFileSync(new URL('../src/services/mapLibreBridge.ts',import.meta.url),'utf8');
  assert.match(bridge,/interactive: false/);
  assert.match(map,/createHybridCameraPort\(map\)\.recenter\(userLiveCoords,navigationModeRef\.current,reducedMotion\)/);
  assert.match(map,/createHybridCameraPort\(map\)\.follow\(userLiveCoords,reducedMotion\)/);
  assert.match(map,/cameraModeChangeRef\.current\?\.\('exploring'\)/);
  assert.match(map,/cameraModeChangeRef\.current\?\.\('following'\)/);
  assert.match(screen,/onCameraModeChange=\{setCameraMode\}/);
  assert.match(screen,/cameraMode==='exploring'&&<span/);
  assert.match(screen,/>Seguir GPS<\/span>/);
  assert.match(screen,/aria-label="Centralizar mapa na minha localização"/);
  assert.doesNotMatch(map,/vectorMapRef\.current\.(?:easeTo|jumpTo|setBearing)/);
});

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
    stop:()=>{},
    getZoom:()=>17,
    setView:(...args:[unknown,...unknown[]])=>calls.push({name:'setView',args}),
    flyTo:(...args:[unknown,...unknown[]])=>calls.push({name:'flyTo',args}),
    panTo:(...args:[unknown,...unknown[]])=>calls.push({name:'panTo',args}),
    fitBounds:(...args:[unknown,...unknown[]])=>calls.push({name:'fitBounds',args})
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
    stop:()=>{},
    getZoom:()=>16,
    jumpTo:(options)=>calls.push({name:'jumpTo',options}),
    easeTo:(options)=>calls.push({name:'easeTo',options}),
    fitBounds:(bounds,options)=>calls.push({name:'fitBounds',options:{bounds,...options}})
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
  assert.doesNotMatch(screen,/>Seguir GPS<\/span>/);
  assert.match(screen,/title=\{cameraMode==='exploring'\?'Voltar a seguir o GPS'/);
  assert.match(screen,/onClick=\{\(\)=>setCenterRequest\(v=>v\+1\)\}/);
  assert.match(screen,/aria-label="Centralizar mapa na minha localização"/);
  assert.match(map,/createHybridCameraPort\(mapInstanceRef\.current\)\.focus\(focusedCoords,15,reducedMotion\)/);
  assert.doesNotMatch(map,/(?:map|mapInstanceRef\.current)\.(?:flyTo|panTo|setView|fitBounds)\(/);
  assert.doesNotMatch(map,/vectorMapRef\.current\.(?:easeTo|jumpTo|setBearing)/);
});

test('all initial positioning and bounds fits go through one hybrid Leaflet camera',()=>{
  const calls:Array<{name:string;args:unknown[]}>=[];
  const surface={
    stop:()=>{},
    getZoom:()=>12,
    setView:(...args:[unknown,...unknown[]])=>calls.push({name:'setView',args}),
    flyTo:(...args:[unknown,...unknown[]])=>calls.push({name:'flyTo',args}),
    panTo:(...args:[unknown,...unknown[]])=>calls.push({name:'panTo',args}),
    fitBounds:(...args:[unknown,...unknown[]])=>calls.push({name:'fitBounds',args})
  };
  const camera=createHybridCameraPort(surface);
  camera.firstGpsFix([-23.55,-46.63]);
  camera.focus([-23.6,-46.64],12);
  camera.fitRoute([[-23.55,-46.63],[-23.6,-46.64]],
    {topLeft:[36,70],bottomRight:[36,260],maxZoom:13});
  assert.deepEqual(calls.map(c=>c.name),['setView','setView','fitBounds']);
  assert.deepEqual(calls[0].args, [[-23.55,-46.63],16,{animate:false}]);
  assert.deepEqual(calls[1].args, [[-23.6,-46.64],12,{animate:false}]);
  assert.deepEqual(calls[2].args, [
    [[-23.55,-46.63],[-23.6,-46.64]],
    {paddingTopLeft:[36,70],paddingBottomRight:[36,260],maxZoom:13,animate:false}
  ]);
});
test('standalone MapLibre camera fits accurate lng/lat bounds and preserves sheet padding',()=>{
  const calls:Array<{name:string;args:unknown[]}>=[];
  const surface={
    stop:()=>{},
    getZoom:()=>12,
    jumpTo:(options:unknown)=>calls.push({name:'jumpTo',args:[options]}),
    easeTo:(options:unknown)=>calls.push({name:'easeTo',args:[options]}),
    fitBounds:(bounds:unknown,options:unknown)=>calls.push({name:'fitBounds',args:[bounds,options]})
  };
  const camera=createStandaloneMapLibreCameraPort(surface);
  camera.firstGpsFix([-23.55,-46.63]);
  camera.focus([-23.6,-46.64],12);
  camera.fitRoute([[-23.55,-46.63],[-23.6,-46.64]],
    {topLeft:[36,70],bottomRight:[36,260],maxZoom:13});
  assert.deepEqual(calls.map(c=>c.name),['jumpTo','jumpTo','fitBounds']);
  assert.deepEqual(calls[0].args[0],{center:[-46.63,-23.55],zoom:16});
  assert.deepEqual(calls[2].args,[
    [[-46.64,-23.6],[-46.63,-23.55]],
    {padding:{top:70,left:36,bottom:260,right:36},maxZoom:13,duration:0}
  ]);
  camera.fitRoute([], {topLeft:[0,0],bottomRight:[0,0],maxZoom:13});
  assert.equal(calls.length,3);
});


test('explicit place focus preserves animation and honors reduced motion on both renderers',()=>{
  const calls:unknown[][]=[];
  const camera=createHybridCameraPort({
    stop:()=>{},
    getZoom:()=>12,
    setView:(...args)=>calls.push(['setView',...args]),
    flyTo:(...args)=>calls.push(['flyTo',...args]),
    panTo:()=>{},fitBounds:()=>{}
  });
  camera.focus([-23.55,-46.63],15,false);
  camera.focus([-23.55,-46.63],15,true);
  assert.deepEqual(calls,[
    ['flyTo',[-23.55,-46.63],15,{duration:1.2,easeLinearity:0.25}],
    ['setView',[-23.55,-46.63],15,{animate:false}]
  ]);
  const standaloneCalls:unknown[][]=[];
  const standalone=createStandaloneMapLibreCameraPort({
    stop:()=>{},
    getZoom:()=>12,
    jumpTo:(options)=>standaloneCalls.push(['jumpTo',options]),
    easeTo:(options)=>standaloneCalls.push(['easeTo',options]),
    fitBounds:()=>{}
  });
  standalone.focus([-23.55,-46.63],15,false);
  standalone.focus([-23.55,-46.63],15,true);
  assert.deepEqual(standaloneCalls,[
    ['easeTo',{center:[-46.63,-23.55],zoom:15,duration:1200}],
    ['jumpTo',{center:[-46.63,-23.55],zoom:15}]
  ]);
});


test('both camera owners cancel a running movement before further commands',()=>{
  for(const standalone of [false,true]){
    let moving=false;
    const surface={
      getZoom:()=>16,
      stop:()=>{moving=false;},
      setView:()=>{},panTo:()=>{},fitBounds:()=>{},jumpTo:()=>{},
      flyTo:()=>{moving=true;},easeTo:()=>{moving=true;}
    };
    const camera=standalone?createStandaloneMapLibreCameraPort(surface):createHybridCameraPort(surface);
    camera.recenter([-23.55,-46.63],true,false);
    assert.equal(moving,true);
    camera.stop();
    assert.equal(moving,false);
    camera.focus([-23.6,-46.7],15,false);
    assert.equal(moving,true);
    camera.stop();
    assert.equal(moving,false);
  }
});

test('repeated user gestures cancel camera motion without duplicate exploration notifications',()=>{
  const source=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  const pause=source.slice(source.indexOf('    const pauseFollowing = () => {'),source.indexOf("    map.on('dragstart',pauseFollowing)"));
  assert.ok(pause.indexOf('createHybridCameraPort(map).stop()')<pause.indexOf('if(followSuspendedRef.current)return'));
  assert.match(pause,/followSuspendedRef.current=true/);
  assert.match(pause,/cameraModeChangeRef.current\?\.\('exploring'\)/);
});


test('standalone camera fits very long road geometries without spreading arguments',()=>{
  let bounds:unknown;
  const camera=createStandaloneMapLibreCameraPort({
    getZoom:()=>12,stop:()=>{},jumpTo:()=>{},easeTo:()=>{},
    fitBounds:(value)=>{bounds=value;}
  });
  const points:Array<[number,number]>=Array.from({length:150000},(_,index)=>
    [-23-index/1000000,-46+index/1000000]);
  camera.fitRoute(points,{topLeft:[36,70],bottomRight:[36,260],maxZoom:13});
  assert.deepEqual(bounds,[[-46,points.at(-1)![0]],[points.at(-1)![1],-23]]);
});


test('pausing standalone camera animation preserves the native gesture in progress',()=>{
  const calls:Array<boolean|undefined>=[];
  const camera=createStandaloneMapLibreCameraPort({
    getZoom:()=>16,stop:(allowGestures)=>{calls.push(allowGestures);},
    jumpTo:()=>{},easeTo:()=>{},fitBounds:()=>{}
  });
  camera.stop();
  assert.deepEqual(calls,[true]);
});

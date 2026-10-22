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

test('idle resume uses latest GPS coordinates after exploring, without altering zoom or pitch',()=>{
  const calls:Array<{command:string;point:[number,number]}>=[],modes:CameraMode[]=[];
  const camera:CameraPort={
    zoom:()=>16,stop:()=>{},firstGpsFix:()=>{},follow:()=>{},fitRoute:()=>{},focus:()=>{},
    recenter:point=>calls.push({command:'recenter',point})
  };
  const session=createNavigationCameraSession(camera,mode=>modes.push(mode));
  assert.equal(session.resume(),false,'no navigation or GPS yet');
  session.update(input);
  session.explore();
  session.update({...input,position:[-23.54,-46.63]});
  assert.equal(session.resume(),true);
  assert.deepEqual(calls,[{command:'recenter',point:[-23.54,-46.63]}]);
  assert.deepEqual(modes,['exploring','following']);
  session.update({...input,navigationMode:false});
  assert.equal(session.resume(),false,'never recenter an inactive trip');
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

test('retorno automático não usa coordenada antiga após perda de GPS',()=>{
  const st=setup();
  st.session.update(input);
  st.session.explore();
  st.session.update({...input,position:undefined});
  assert.equal(st.session.resume(),false,'não recentralizar em uma posição antiga');
  assert.deepEqual(st.calls,['first','stop']);
  st.session.update({...input,position:[-23.501,-46.601]});
  assert.equal(st.session.resume(),true);
  assert.deepEqual(st.calls,['first','stop','recenter']);
});

test('zoom automático ocorre uma vez na aproximação, depois volta ao nível normal',()=>{
  const commands:Array<{zoom:number;point:[number,number];reduced:boolean}>=[];
  const port:CameraPort={
    zoom:()=>16,stop:()=>{},firstGpsFix:()=>{},focus:()=>{},fitRoute:()=>{},
    recenter:()=>{},follow:()=>{},
    zoomToTurn:(point,zoom,reduced)=>commands.push({point,zoom,reduced})
  };
  const session=createNavigationCameraSession(port,()=>{});
  const near={...input,maneuverMeters:230,speedMetersPerSecond:8};
  session.update(near);
  session.update({...near,position:[-23.5001,-46.6],maneuverMeters:215});
  assert.equal(commands.length,1,'sem comandos repetidos a cada amostra GPS');
  assert.equal(commands[0].zoom,17);
  session.update({...near,position:[-23.5002,-46.6],maneuverMeters:500});
  assert.deepEqual(commands.map(c=>c.zoom),[17,16]);
});

test('zoom manual é respeitado após 7 segundos; botão GPS volta a permitir ajuda de conversão',()=>{
  const zooms:number[]=[];
  const port:CameraPort={
    zoom:()=>17,stop:()=>{},firstGpsFix:()=>{},focus:()=>{},fitRoute:()=>{},
    recenter:()=>{},follow:()=>{},zoomToTurn:(_point,zoom)=>{zooms.push(zoom);}
  };
  const session=createNavigationCameraSession(port,()=>{});
  session.update({...input,maneuverMeters:230});
  session.overrideZoom();session.explore();
  assert.equal(session.resume(),true);
  session.update({...input,position:[-23.5002,-46.6],maneuverMeters:200});
  session.update({...input,position:[-23.5003,-46.6],maneuverMeters:800});
  assert.deepEqual(zooms,[17],'não sobrescrever a escala escolhida manualmente');
  session.update({...input,centerRequest:1,position:[-23.5003,-46.6],maneuverMeters:230});
  session.update({...input,centerRequest:1,position:[-23.5004,-46.6],maneuverMeters:220});
  assert.deepEqual(zooms,[17,17],'botão GPS restaura o zoom automático nas manobras');
});

test('sem GPS válido ou durante a exploração, zoom de conversão não movimenta mapa',()=>{
  const zooms:number[]=[];
  const port:CameraPort={
    zoom:()=>16,stop:()=>{},firstGpsFix:()=>{},focus:()=>{},fitRoute:()=>{},
    recenter:()=>{},follow:()=>{},zoomToTurn:(_point,zoom)=>{zooms.push(zoom);}
  };
  const session=createNavigationCameraSession(port,()=>{});
  session.update({...input,position:undefined,maneuverMeters:100});
  session.update({...input,position:[120,-46],maneuverMeters:100});
  assert.deepEqual(zooms,[]);
  session.update({...input,maneuverMeters:900});
  session.explore();
  session.update({...input,maneuverMeters:100});
  assert.deepEqual(zooms,[]);
  session.update({...input,navigationMode:false,maneuverMeters:100});
  assert.deepEqual(zooms,[]);
});

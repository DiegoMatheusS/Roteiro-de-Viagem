import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindManualMapZoom,isManualMapZoom} from '../src/services/mapUserZoomGestures';

test('only deliberate map zoom gestures suspend GPS follow',()=>{
  assert.equal(isManualMapZoom({type:'touchstart',touchCount:1}),false);
  assert.equal(isManualMapZoom({type:'touchstart',touchCount:2}),true);
  assert.equal(isManualMapZoom({type:'pointerdown',activeTouchPointers:1}),false);
  assert.equal(isManualMapZoom({type:'pointerdown',activeTouchPointers:2}),true);
  assert.equal(isManualMapZoom({type:'wheel',deltaY:0}),false);
  assert.equal(isManualMapZoom({type:'wheel',deltaY:120}),true);
  assert.equal(isManualMapZoom({type:'wheel',deltaY:-90}),true);
  assert.equal(isManualMapZoom({type:'dblclick'}),true);
  assert.equal(isManualMapZoom({type:'gesturestart'}),true);
  assert.equal(isManualMapZoom({type:'keydown',key:'='}),true);
  assert.equal(isManualMapZoom({type:'keydown',key:'-'}),true);
  for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])
    assert.equal(isManualMapZoom({type:'keydown',key}),true);
  assert.equal(isManualMapZoom({type:'keydown',key:'Tab'}),false);
  assert.equal(isManualMapZoom({type:'keydown',key:'Enter'}),false);
});
test('gesture listeners are passive, respond to pinch and are removed when the map unmounts',()=>{
  const target=new EventTarget() as unknown as HTMLElement;
  let n=0;
  const cleanup=bindManualMapZoom(target,()=>{n++;});
  const send=(type:string,props:Record<string,unknown>={})=>{
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,Object.fromEntries(Object.entries(props).map(([key,value])=>[key,{value,configurable:true}])));
    target.dispatchEvent(event);
  };
  send('touchstart',{touches:[{identifier:1}]});
  assert.equal(n,0);
  send('wheel',{deltaY:130});
  assert.equal(n,1);
  send('touchstart',{touches:[{identifier:1},{identifier:2}]});
  assert.equal(n,2);
  send('pointerdown',{pointerType:'touch',pointerId:51});
  send('pointerdown',{pointerType:'touch',pointerId:52});
  assert.equal(n,3);
  send('pointerup',{pointerType:'touch',pointerId:51});
  send('pointercancel',{pointerType:'touch',pointerId:52});
  send('dblclick');
  assert.equal(n,4);
  send('keydown',{key:'+'});
  assert.equal(n,5);
  send('keydown',{key:'ArrowLeft'});
  assert.equal(n,6);
  cleanup();
  send('wheel',{deltaY:120});
  send('touchstart',{touches:[{},{}]});
  assert.equal(n,6);
});
test('Leaflet remains the single camera owner and existing follow button resumes after zoom exploration',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../src/components/ActiveTripModal.tsx',import.meta.url),'utf8');
  const bridge=readFileSync(new URL('../src/services/mapLibreBridge.ts',import.meta.url),'utf8');
  assert.match(map,/bindManualMapZoom\(map\.getContainer\(\),pauseFollowing\)/);
  assert.match(map,/map\.on\('boxzoomstart',pauseFollowing\)/);
  assert.match(map,/map\.off\('boxzoomstart',pauseFollowing\)/);
  assert.match(map,/unbindManualZoom\(\)/);
  assert.match(map,/cameraModeChangeRef\.current\?\.\('exploring'\)/);
  assert.match(map,/cameraModeChangeRef\.current\?\.\('following'\)/);
  assert.match(map,/createHybridCameraPort\(map\)\.follow\(userLiveCoords,reducedMotion\)/);
  assert.match(screen,/onCameraModeChange=\{setCameraMode\}/);
  assert.doesNotMatch(screen,/>Seguir GPS<\/span>/,
    'GPS remains an icon-only control while exploring');
  assert.match(screen,/aria-label="Centralizar mapa na minha localização"/);
  assert.match(screen,/onClick=\{\(\)=>setCenterRequest\(v=>v\+1\)\}/);
  const navCss=readFileSync(new URL('../src/role-navigation-figma.css',import.meta.url),'utf8');
  assert.match(screen,/className="rdv-nav-right-controls"/);
  assert.match(navCss,/\.rdv-nav-right-controls\s*\{[^}]*pointer-events:\s*none/s,
    'empty floating-control space must not steal map pan and zoom touches');
  assert.match(navCss,/\.rdv-nav-right-controls button\s*\{pointer-events:\s*auto/,
    'voice and center buttons must remain interactive');
  assert.match(bridge,/interactive: false/);
  assert.doesNotMatch(map,/vectorMapRef\.current\.(?:jumpTo|easeTo|setBearing)/);
});


test('typing and popup controls preserve GPS following; gestures on POIs explore the map',()=>{
  const oldElement=Object.getOwnPropertyDescriptor(globalThis,'Element');
  const oldHTMLElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');
  class TestElement extends EventTarget {
    tagName='DIV';
    isContentEditable=false;
    overlay=false;poi=false;
    closest(selector:string){
      return selector.includes('.role-poi-marker')?(this.poi?this:null):this.overlay?this:null;
    }
  }
  Object.defineProperty(globalThis,'Element',{value:TestElement,configurable:true});
  Object.defineProperty(globalThis,'HTMLElement',{value:TestElement,configurable:true});
  try{
    for(const kind of ['INPUT','TEXTAREA','SELECT','editable','overlay','poi','map']){
      const target=new TestElement();
      target.tagName=['INPUT','TEXTAREA','SELECT'].includes(kind)?kind:'DIV';
      target.isContentEditable=kind==='editable';
      target.overlay=kind==='overlay';target.poi=kind==='poi';
      let calls=0;
      const cleanup=bindManualMapZoom(target as unknown as HTMLElement,()=>calls++);
      for(const key of ['ArrowUp','ArrowLeft','+','-']){
        const event=new Event('keydown');
        Object.defineProperty(event,'key',{value:key});
        target.dispatchEvent(event);
      }
      assert.equal(calls,(kind==='map'||kind==='poi')?4:0,kind);
      if(kind==='overlay'){
        for(const [id,overlay] of [[1,true],[2,false]] as const){
          target.overlay=overlay;
          const event=new Event('pointerdown');
          Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:id}});
          target.dispatchEvent(event);
        }
        assert.equal(calls,0,'a touch on a popup must not count toward a map pinch');
      }
      cleanup();
    }
  }finally{
    if(oldElement)Object.defineProperty(globalThis,'Element',oldElement);
    else Reflect.deleteProperty(globalThis,'Element');
    if(oldHTMLElement)Object.defineProperty(globalThis,'HTMLElement',oldHTMLElement);
    else Reflect.deleteProperty(globalThis,'HTMLElement');
  }
});


test('touch released outside the map or interrupted by app switching cannot become a phantom pinch',()=>{
  const view=new EventTarget();
  const doc=Object.assign(new EventTarget(),{defaultView:view,visibilityState:'visible'});
  const map=Object.assign(new EventTarget(),{ownerDocument:doc});
  let pauses=0;
  const cleanup=bindManualMapZoom(map as unknown as HTMLElement,()=>pauses++);
  const send=(target:EventTarget,type:string,pointerId=1)=>{
    const event=new Event(type);
    Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:pointerId}});
    target.dispatchEvent(event);
  };
  send(map,'pointerdown',1);
  send(doc,'pointerup',1);
  send(map,'pointerdown',2);
  assert.equal(pauses,0,'release outside the map clears the old finger');
  send(doc,'pointercancel',2);
  send(map,'pointerdown',3);
  send(map,'lostpointercapture',3);
  send(map,'pointerdown',4);
  assert.equal(pauses,0,'lost capture clears that finger');
  view.dispatchEvent(new Event('blur'));
  send(map,'pointerdown',5);
  assert.equal(pauses,0,'leaving the app clears pending touches');
  doc.visibilityState='hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.visibilityState='visible';
  send(map,'pointerdown',6);
  assert.equal(pauses,0,'backgrounding clears pending touches');
  send(map,'pointerdown',7);
  assert.equal(pauses,1,'a real two-finger gesture still pauses GPS');
  cleanup();
  send(map,'pointerdown',8);
  send(doc,'pointerup',6);
  view.dispatchEvent(new Event('blur'));
  assert.equal(pauses,1,'unmounted map stops handling gestures');
});

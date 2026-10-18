import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindMapResumeRefresh} from '../src/services/mapResumeRefresh';

function setup(){
  const doc=Object.assign(new EventTarget(),{hidden:false});
  let id=0;
  const frames=new Map<number,FrameRequestCallback>();
  const win=Object.assign(new EventTarget(),{
    requestAnimationFrame(callback:FrameRequestCallback){frames.set(++id,callback);return id;},
    cancelAnimationFrame(key:number){frames.delete(key);}
  });
  let refreshes=0;
  const cleanup=bindMapResumeRefresh(doc,win,()=>refreshes++);
  const flush=()=>{
    const pending=[...frames.values()];frames.clear();
    for(const callback of pending)callback(0);
  };
  return {doc,win,frames,cleanup,flush,count:()=>refreshes};
}

test('returning to map coalesces lifecycle events without continuous redraws',()=>{
  const s=setup();
  assert.equal(s.frames.size,0);
  s.doc.dispatchEvent(new Event('visibilitychange'));
  s.win.dispatchEvent(new Event('focus'));
  s.win.dispatchEvent(new Event('pageshow'));
  assert.equal(s.frames.size,1);
  s.flush();
  assert.equal(s.count(),1);
  assert.equal(s.frames.size,0);
  s.win.dispatchEvent(new Event('orientationchange'));
  s.flush();
  assert.equal(s.count(),2);
  s.cleanup();
});

test('background and unmount cancel pending redraws including stale callbacks',()=>{
  const s=setup();
  s.win.dispatchEvent(new Event('focus'));
  s.doc.hidden=true;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(s.frames.size,0);
  s.win.dispatchEvent(new Event('pageshow'));
  s.flush();
  assert.equal(s.count(),0);
  s.doc.hidden=false;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  const stale=[...s.frames.values()][0];
  s.cleanup();
  assert.equal(s.frames.size,0);
  stale(0);
  s.win.dispatchEvent(new Event('focus'));
  s.win.dispatchEvent(new Event('orientationchange'));
  s.doc.dispatchEvent(new Event('visibilitychange'));
  s.flush();
  assert.equal(s.count(),0);
  assert.equal(s.frames.size,0);
});

test('hidden document is checked again when a frame runs',()=>{
  const s=setup();
  s.win.dispatchEvent(new Event('pageshow'));
  s.doc.hidden=true;
  s.flush();
  assert.equal(s.count(),0);
  s.cleanup();
});

test('map resume refresh resizes both surfaces without changing route or GPS camera',()=>{
  const source=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  const start=source.indexOf('const unbindResumeRefresh=');
  const end=source.indexOf('// Handle container resize',start);
  assert.ok(start>=0 && end>start);
  const refresh=source.slice(start,end);
  assert.match(refresh,/mapInstanceRef.current!==map/);
  assert.match(refresh,/map.invalidateSize\(\{animate:false,debounceMoveend:true\}\)/);
  assert.match(refresh,/gl.resize\(\);gl.triggerRepaint\(\)/);
  assert.doesNotMatch(refresh,/fitRoute|fitBounds|recenter|setView|followSuspendedRef/);
  assert.ok(source.indexOf('unbindResumeRefresh();')<source.indexOf('      map.remove();'));
});

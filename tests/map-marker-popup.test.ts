import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMarkerPopup} from '../src/services/mapMarkerPopup';

function fixture(){
  const element=new EventTarget();
  let toggles=0;
  const marker={getElement:()=>element as HTMLElement,togglePopup:()=>{toggles++;}};
  assert.equal(bindMarkerPopup(marker),marker);
  return {element,toggles:()=>toggles};
}
function keyEvent(key:string,repeat=false){
  const event=new Event('keydown',{cancelable:true,bubbles:true});
  Object.defineProperties(event,{key:{value:key},repeat:{value:repeat}});
  return event;
}
test('marker click opens popup while stopping coordinate selection propagation',()=>{
  const {element,toggles}=fixture();
  const event=new Event('click',{bubbles:true});
  element.dispatchEvent(event);
  assert.equal(toggles(),1);
  assert.equal(event.cancelBubble,true);
});
test('Enter and Space toggle once and suppress synthetic clicks and repeat',()=>{
  const {element,toggles}=fixture();
  for(const key of ['Enter',' ']){
    const event=keyEvent(key);element.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);
    const repeated=keyEvent(key,true);element.dispatchEvent(repeated);
    assert.equal(repeated.defaultPrevented,true);
  }
  assert.equal(toggles(),2);
  const other=keyEvent('ArrowUp');element.dispatchEvent(other);
  assert.equal(other.defaultPrevented,false);
  assert.equal(toggles(),2);
});

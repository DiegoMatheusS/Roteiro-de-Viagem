import test from 'node:test';
import assert from 'node:assert/strict';
import {whilePageVisible} from '../src/services/whilePageVisible';

test('hidden home releases GPS; returning starts exactly one watch; disposal never resumes it',()=>{
  const doc=Object.assign(new EventTarget(),{hidden:false}),page=new EventTarget();
  let starts=0,stops=0;
  const dispose=whilePageVisible(()=>{starts++;return()=>{stops++;};},doc,page);
  assert.equal(starts,1);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  doc.dispatchEvent(new Event('visibilitychange'));assert.equal(stops,1);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
  page.dispatchEvent(new Event('pageshow'));assert.equal(starts,2);
  page.dispatchEvent(new Event('pagehide'));assert.equal(stops,2);
  doc.dispatchEvent(new Event('visibilitychange'));assert.equal(starts,2,'page cache must remain paused');
  page.dispatchEvent(new Event('pageshow'));assert.equal(starts,3);
  dispose();dispose();assert.equal(stops,3);
  page.dispatchEvent(new Event('pageshow'));doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(starts,3);
});
test('mounting a hidden page does not request GPS until it becomes visible',()=>{
  const doc=Object.assign(new EventTarget(),{hidden:true});let starts=0,stops=0;
  const dispose=whilePageVisible(()=>{starts++;return()=>{stops++;};},doc,new EventTarget());
  assert.equal(starts,0);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(starts,1);
  dispose();assert.equal(stops,1);
});

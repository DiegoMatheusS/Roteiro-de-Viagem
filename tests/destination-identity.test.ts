import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationExploreKey} from '../src/services/destinationIdentity';

test('same destination name with different coordinates resets the route panel',()=>{
  const a={name:'Praça Central',coords:[-23.5,-46.6] as [number,number]};
  const b={...a,coords:[-23.6,-46.7] as [number,number]};
  assert.notEqual(destinationExploreKey(a),destinationExploreKey(b));
  assert.equal(destinationExploreKey(a),destinationExploreKey({...a,coords:[...a.coords]}));
});
test('changing the destination identifier or name invalidates stale routes',()=>{
  const base={name:'Lugar',id:'osm:1',coords:[-23.5,-46.6] as [number,number]};
  assert.notEqual(destinationExploreKey(base),destinationExploreKey({...base,id:'osm:2'}));
  assert.notEqual(destinationExploreKey(base),destinationExploreKey({...base,name:'Outro lugar'}));
});

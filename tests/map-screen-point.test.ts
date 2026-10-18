import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mapScreenPoint} from './helpers/map-screen-point';

test('serialized map click calculation executes without compiler or Node globals',()=>{
  const root={dataset:{mapCenter:'[-23.545,-46.62]',mapZoom:'13'},
    getBoundingClientRect:()=>({x:10,y:20,width:390,height:620})};
  // Match Playwright's function serialization in a fresh page realm. Deliberately
  // do not provide __name or any globals from the tsx/esbuild module runtime.
  const point=runInNewContext(`(${mapScreenPoint.toString()})(root,[-23.545,-46.62])`,{root});
  assert.equal(point.x,205);
  assert.equal(point.y,330);
});

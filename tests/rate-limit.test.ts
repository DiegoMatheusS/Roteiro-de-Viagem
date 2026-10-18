import test from 'node:test';
import assert from 'node:assert/strict';
import {createRateLimiter} from '../server/rateLimit';

test('rate limiter rejects requests beyond quota and renews expired windows',()=>{
  let time=1000;const limit=createRateLimiter(4,()=>time);
  limit('a',2,1000);limit('a',2,1000);
  assert.throws(()=>limit('a',2,1000),{status:429});
  time+=1000;limit('a',2,1000);
});

test('rate limiter bounds memory without evicting active counters',()=>{
  let time=0;const limit=createRateLimiter(2,()=>time);
  limit('a',1,1000);limit('b',1,3000);
  assert.throws(()=>limit('c',1,1000),{status:429});
  assert.throws(()=>limit('a',1,1000),{status:429});
  time=1500;limit('c',1,1000);
  assert.throws(()=>limit('b',1,3000),{status:429});
});

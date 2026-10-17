import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedRoadLimit, rememberRoadLimit } from '../src/services/roadSpeedLimitCache';

test('cache somente em coordenadas próximas, com precisão adequada e prazo curto', () => {
  const coords: [number,number] = [-21.987654,-47.123456];
  const now = 1790000000000;
  assert.equal(getCachedRoadLimit(coords,5,now), undefined);
  rememberRoadLimit(coords,60,now);
  assert.equal(getCachedRoadLimit(coords,5,now+100), 60);
  assert.equal(getCachedRoadLimit([coords[0]+0.0004,coords[1]],5,now+100), undefined);
  assert.equal(getCachedRoadLimit(coords,50,now+100), undefined);
  assert.equal(getCachedRoadLimit(coords,5,now+30001), undefined);
});
test('limite ausente é armazenado por menos tempo que limite conhecido', () => {
  const coords: [number,number] = [-20.223344,-45.334455];
  const now = 1790000000000;
  rememberRoadLimit(coords,null,now);
  assert.equal(getCachedRoadLimit(coords,5,now+1000),null);
  assert.equal(getCachedRoadLimit(coords,5,now+15001),undefined);
});

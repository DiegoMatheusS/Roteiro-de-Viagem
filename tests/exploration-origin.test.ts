import test from 'node:test';
import assert from 'node:assert/strict';
import {recentExplorationOrigin} from '../src/services/explorationOrigin';
import type {DeviceLocation} from '../src/services/locationService';

const now=Date.parse('2026-10-18T21:55:00.000Z');
const gps:DeviceLocation={
  coords:[-23.551,-46.629],accuracyMeters:3,speedMetersPerSecond:null,
  timestamp:now
};

test('map route reuses a valid 30-60 second GPS reading instead of waiting for another position',()=>{
  assert.deepEqual(recentExplorationOrigin({...gps,timestamp:now-45000},now),gps.coords);
  assert.deepEqual(recentExplorationOrigin({...gps,timestamp:now-60000},now),gps.coords);
  assert.deepEqual(recentExplorationOrigin({...gps,timestamp:now-5000},now),gps.coords);
});
test('stale, future or inaccurate GPS readings require a new position',()=>{
  assert.equal(recentExplorationOrigin({...gps,timestamp:now-60001},now),null);
  assert.equal(recentExplorationOrigin({...gps,timestamp:now+5001},now),null);
  assert.equal(recentExplorationOrigin({...gps,accuracyMeters:101},now),null);
  assert.equal(recentExplorationOrigin({...gps,accuracyMeters:NaN},now),null);
  assert.equal(recentExplorationOrigin({...gps,coords:[NaN,-46.6]},now),null);
  assert.equal(recentExplorationOrigin(null,now),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {getRecentDeviceLocation,rememberDeviceLocation,canReuseWarmGpsForSession} from '../src/services/locationService';
import {isFreshGpsFix} from '../src/services/gpsFreshness';
import {readFileSync} from 'node:fs';

test('reuse a fresh GPS fix across the startup map -> main map remount',()=>{
  const now=Date.now();
  const sample={coords:[-23.55,-46.63] as [number,number],accuracyMeters:12,
    speedMetersPerSecond:0,timestamp:now};
  rememberDeviceLocation(sample,now);
  assert.deepEqual(getRecentDeviceLocation(30000,now)?.coords,sample.coords);
  assert.equal(isFreshGpsFix(getRecentDeviceLocation(30000,now)!.timestamp,now),true);
  const returned=getRecentDeviceLocation(30000,now)!;
  returned.coords[0]=0;
  assert.notEqual(getRecentDeviceLocation(30000,now)?.coords[0],0,
    'cache does not expose mutable internal coordinates');
  assert.equal(getRecentDeviceLocation(30000,now+31000),null);
  assert.equal(isFreshGpsFix(now,now+6001),false,
    'expired GPS must never guide navigation even if cached for visual display');
});
test('stale and impossible future fixes are not retained in warm cache',()=>{
  const now=Date.now()+32000;
  const old=getRecentDeviceLocation(30000,now);
  assert.equal(old,null);
  rememberDeviceLocation({coords:[0,0],accuracyMeters:10,speedMetersPerSecond:0,
    timestamp:now-40000},now);
  assert.equal(getRecentDeviceLocation(30000,now),null);
});
test('home uses cache before waiting for a fresh high-accuracy GPS fix',()=>{
  const source=readFileSync(new URL('../src/hooks/useDeviceLocation.ts',import.meta.url),'utf8');
  assert.match(source,/getRecentDeviceLocation\(\)/);
  assert.match(source,/status:enabled\?\(fresh\?'ready':'loading'\):'idle'/);
  const provider=readFileSync(new URL('../src/services/locationService.ts',import.meta.url),'utf8');
  assert.match(provider,/NativeGeolocation\.watchPosition\(\{ enableHighAccuracy: true, maximumAge: 3000/);
});

test('do not reuse startup fix across distinct trips or convoy tracking sessions',()=>{
  assert.equal(canReuseWarmGpsForSession('role-start-map'),true);
  assert.equal(canReuseWarmGpsForSession('role-home'),true);
  assert.equal(canReuseWarmGpsForSession('map-destination-search'),true);
  assert.equal(canReuseWarmGpsForSession('gps-1'),false);
  assert.equal(canReuseWarmGpsForSession('gps-2'),false);
  assert.equal(canReuseWarmGpsForSession(''),false);
});

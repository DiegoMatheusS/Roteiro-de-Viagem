import assert from 'node:assert/strict';
import test from 'node:test';
import { splitNavigationRoute } from '../src/services/routeProgress';

test('route ahead stays light blue until a fresh accurate GPS fix is matched', () => {
  const path: [number, number][] = [[-23.5,-46.6],[-23.5,-46.59],[-23.5,-46.58]];
  const unknown = splitNavigationRoute(path, null);
  assert.equal(unknown.onRoute,false);
  assert.equal(unknown.passed.length,0);
  assert.deepEqual(unknown.ahead,path);
  const badFix = splitNavigationRoute(path,[-23.5,-46.594],100);
  assert.equal(badFix.onRoute,false);
  const offRoad = splitNavigationRoute(path,[-23.501,-46.595],8);
  assert.equal(offRoad.onRoute,false);
});

test('GPS divides a route at the actual projected location, not whole markers', () => {
  const path: [number, number][] = [[-23.5,-46.6],[-23.5,-46.59],[-23.5,-46.58]];
  const result = splitNavigationRoute(path,[-23.5,-46.595],8);
  assert.equal(result.onRoute,true);
  assert.equal(result.passed.length,2);
  assert.equal(result.ahead.length,3);
  assert.ok(Math.abs(result.passed.at(-1)![1]+46.595)<0.000001);
  assert.deepEqual(result.passed.at(-1),result.ahead[0]);
  assert.deepEqual(result.ahead.at(-1),path.at(-1));
  assert.ok(result.progressKm > 0);
});

test('route-matching returns no dark-blue progress for bad accuracy or implausible positions', () => {
  const path: [number, number][] = [[0,0],[0,0.01]];
  assert.equal(splitNavigationRoute(path,[0.0008,0.005],10).onRoute,false);
  assert.equal(splitNavigationRoute(path,[0,0.005],70).onRoute,false);
  assert.equal(splitNavigationRoute(path,[Number.NaN,0],5).onRoute,false);
  assert.equal(splitNavigationRoute([], [0,0],5).onRoute,false);
});

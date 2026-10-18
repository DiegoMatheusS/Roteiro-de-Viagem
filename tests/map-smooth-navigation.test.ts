import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');

test('GPS and progress render in independent Leaflet fallback groups',()=>{
  assert.match(source,/livePinGroupRef\.current = L\.layerGroup\(\)\.addTo\(map\)/);
  assert.match(source,/progressGroupRef\.current = L\.layerGroup\(\)\.addTo\(map\)/);
  assert.match(source,/existing\.setLatLng\(userLiveCoords\)/);
  assert.match(source,/liveFallbackRef\.current=L\.marker\(userLiveCoords/);
  assert.match(source,/const progress=splitRouteAtPosition\(routePath,userLiveCoords,travelledDistanceKm,totalRouteKm\)/);
  assert.match(source,/if \(vectorRoutesReady \|\| !\(navigationMode \|\| blueRoute\) \|\| routePath\.length<2\) return/);
});
test('static layers are not rebuilt on position fixes or travelled-distance changes',()=>{
  const start=source.indexOf('// Update static markers, alternatives and road shape');
  assert.ok(start>0);
  const end=source.indexOf('  ]);',source.indexOf('  }, [\n    originCoords,',start));
  assert.ok(end>start);
  const effect=source.slice(start,end+6);
  assert.match(effect,/group\.clearLayers\(\)/);
  assert.doesNotMatch(effect,/const liveIcon = L\.divIcon/);
  const dependencies=effect.slice(effect.lastIndexOf('  }, ['));
  assert.doesNotMatch(dependencies,/\buserLiveCoords\b/);
  assert.doesNotMatch(dependencies,/\btravelledDistanceKm\b/);
  assert.doesNotMatch(dependencies,/\btotalRouteKm\b/);
  assert.doesNotMatch(dependencies,/\bonSelectRoute\b/);
  assert.match(source,/selectRouteRef\.current\?\.\(option\.id\)/);
});
test('user dragging pauses camera following but GPS recenter resumes it',()=>{
  assert.match(source,/map\.on\('dragstart',pauseFollowing\)/);
  assert.match(source,/map\.off\('dragstart',pauseFollowing\)/);
  assert.match(source,/followSuspendedRef\.current=true/);
  assert.match(source,/followSuspendedRef\.current=false/);
  assert.match(source,/else if \(followUser && !followSuspendedRef\.current\)/);
  assert.match(source,/createHybridCameraPort\(map\)\.follow\(userLiveCoords,reducedMotion\)/);
  assert.match(source,/window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
});
test('smooth pinch zoom is enabled while fallback and native markers remain',()=>{
  assert.match(source,/zoomAnimation: roadStyle \|\| navigationMode/);
  assert.match(source,/fadeAnimation: roadStyle \|\| navigationMode/);
  assert.match(source,/zoomSnap: resumeViewport \? 0 : roadStyle \|\| navigationMode \? 0\.5 : 1/);
  assert.match(source,/zoomDelta: roadStyle \|\| navigationMode \? 0\.5 : 1/);
  assert.match(source,/showRaster\(\)/);
  assert.match(source,/vectorNavigationController\.current\?\.update\(navigationPinInputs\.current\)/);
  assert.match(source,/selectedRouteId/);
});

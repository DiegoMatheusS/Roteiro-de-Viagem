import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validGpsHeading, shortestHeadingTransition } from '../src/services/gpsHeading';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('GPS heading never guesses direction from a position, ignores invalid and stationary course',()=>{
  assert.equal(validGpsHeading(null),null);
  assert.equal(validGpsHeading(undefined),null);
  assert.equal(validGpsHeading(NaN),null);
  assert.equal(validGpsHeading(-1),null);
  assert.equal(validGpsHeading(360),null);
  assert.equal(validGpsHeading(190,0),null);
  assert.equal(validGpsHeading(190,1.39),null);
  assert.equal(validGpsHeading(190,1.4),190);
  assert.equal(validGpsHeading(0,8),0);
  assert.equal(validGpsHeading(270,null),270);
});
test('GPS arrow crosses true north by the shortest angle, without full turn',()=>{
  assert.equal(shortestHeadingTransition(null,37),37);
  assert.equal(shortestHeadingTransition(359,1),361);
  assert.equal(shortestHeadingTransition(1,359),-1);
  assert.equal(shortestHeadingTransition(181,179),179);
  assert.equal(shortestHeadingTransition(359,2),362);
  assert.equal(shortestHeadingTransition(362,358),358);
});
test('native Android transports optional real GPS course',()=>{
  const native=read('android/app/src/main/java/br/com/roteirodeviagem/app/TravelLocationService.java');
  assert.match(native,/location\.hasBearing\(\)/);
  assert.match(native,/pos\.put\("headingDegrees"/);
});
test('live arrow rotates in both MapLibre and raster fallback, without desyncing map cameras',()=>{
  const controller=read('src/services/mapLibreNavigationPins.ts');
  const map=read('src/components/InteractiveMap.tsx');
  const trip=read('src/components/ActiveTripModal.tsx');
  const home=read('src/components/NavigationHome.tsx');
  const tab=read('src/components/MapTab.tsx');
  assert.match(controller,/arrowHeadingStyle\(svg,lastHeading,input\.navigationMode\?frame\.headingDegrees:input\.headingDegrees/);
  assert.match(map,/liveFallbackHeadingRef\.current=arrowHeadingStyle\(/);
  assert.match(map,/userHeadingDegrees\?: number \| null/);
  assert.match(map,/userSpeedMetersPerSecond\?: number \| null/);
  assert.match(map,/navigationPinInputs\.current=\{/);
  assert.match(trip,/userHeadingDegrees=\{isGpsActive \? tracking\.position\?\.headingDegrees : null\}/);
  assert.match(home,/userHeadingDegrees=\{gps\.status==='ready'\?gps\.position\?\.headingDegrees:null\}/);
  assert.match(tab,/userHeadingDegrees=\{location\.status === "ready" \? location\.position\?\.headingDegrees : null\}/);
  assert.doesNotMatch(map,/vectorMapRef\.current\.setBearing/);
});


test('GPS nativo recebe sensores de rotação e baixa latência, sem confundir posição com orientação',()=>{
  const service=read('android/app/src/main/java/br/com/roteirodeviagem/app/TravelLocationService.java');
  const bridge=read('android/app/src/main/java/br/com/roteirodeviagem/app/TravelNativePlugin.java');
  const hook=read('src/hooks/useTripTracking.ts');
  assert.match(service,/TYPE_ROTATION_VECTOR/);
  assert.match(service,/getRotationMatrixFromVector/);
  assert.match(service,/requestLocationUpdates\(LocationManager.GPS_PROVIDER,750,0,this\)/);
  assert.match(bridge,/deviceHeadingDegrees/);
  assert.match(hook,/window\.setInterval\(read,250\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Rolê opens a real map during account hydration, never a blocking loading card',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  const startup=readFileSync(new URL('../src/components/StartupMap.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/Carregando seus dados de viagem/);
  assert.match(app,/if \(auth\.loading \|\| !accountReady\) return <StartupMap/);
  assert.match(startup,/<InteractiveMap roadStyle/);
  assert.match(startup,/userLiveCoords=\{position\}/);
  assert.match(startup,/centerOnUserRequest=\{centerRequest\}/);
  assert.match(app,/syncState==='conflict' && <SyncConflictPanel/);
  assert.match(app,/syncState==='error' && <button/);
  assert.doesNotMatch(startup,/saveTrip|saveProfile|replaceSnapshot|setScope/);
});
test('Explore photos are real, credited and unknown places do not inherit generic images',()=>{
  const explore=readFileSync(new URL('../src/components/ToursTab.tsx',import.meta.url),'utf8');
  assert.match(explore,/Wikimedia/);
  assert.match(explore,/photoCredit:/);
  assert.match(explore,/place\.photoPage && place\.photoCredit/);
  assert.match(explore,/onError=\{event=>\{event\.currentTarget\.hidden=true/);
  assert.doesNotMatch(explore,/figma-ibirapuera\.svg|figma-romeiros\.svg/);
  assert.match(explore,/Local sem fotografia verificada/);
});

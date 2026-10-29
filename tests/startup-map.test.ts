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
  assert.ok(startup.includes('src="/roteiro-logo.png"'),'use the original Rolê logo rather than the example pin icon');
  assert.ok(startup.includes('rdv-start-brand-wave'),'brand pulse appears over the map');
  assert.ok(startup.includes('setShowBrand(false),2100'),'brand does not persist while the API is offline');
  const styles=readFileSync(new URL('../src/role-figma.css',import.meta.url),'utf8');
  assert.ok(styles.includes('.rdv-start-brand-logo'));
  assert.ok(styles.includes('pointer-events:none'),'logo never intercepts map gestures');
  assert.ok(styles.includes('prefers-reduced-motion:reduce'),'respect accessibility animation preferences');
  assert.match(app,/syncState==='conflict' && <SyncConflictPanel/);
  assert.match(app,/syncState==='error' && <button/);
  assert.doesNotMatch(startup,/saveTrip|saveProfile|replaceSnapshot|setScope/);
});
test('Explore photos are real, credited and unknown places do not inherit generic images',()=>{
  const explore=readFileSync(new URL('../src/components/ToursTab.tsx',import.meta.url),'utf8');
  const catalog=readFileSync(new URL('../src/catalogs/saoPauloExplore.ts',import.meta.url),'utf8');
  assert.ok(catalog.includes('commons.wikimedia.org'));
  assert.match(catalog,/photoCredit/);
  assert.match(explore,/place\.photoPage && place\.photoCredit/);
  assert.match(explore,/onError=\{event=>\{event\.currentTarget\.hidden=true/);
  assert.doesNotMatch(explore,/figma-ibirapuera\.svg|figma-romeiros\.svg/);
  assert.match(explore,/Local sem fotografia verificada/);
});

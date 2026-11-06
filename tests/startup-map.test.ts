import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Rolê waits for account hydration without flashing an interim map',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  const startup=readFileSync(new URL('../src/components/StartupMap.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/Carregando seus dados de viagem/);
  assert.match(app,/if \(!startupReady \|\| auth\.loading \|\| !accountReady\) return <StartupMap/);
  assert.match(startup,/aria-label="Preparando o Rolê"/);
  assert.match(startup,/aria-label="Abrindo o Rolê"/);
  assert.doesNotMatch(startup,/<InteractiveMap|useDeviceLocation|MapTrafficControl/);
  assert.match(app,/syncState==='conflict' && <SyncConflictPanel/);
  assert.match(app,/syncState==='error' && <button/);
  assert.doesNotMatch(startup,/saveTrip|saveProfile|replaceSnapshot|setScope/);
});
test('Explore photos are real, credited and unknown places do not inherit generic images',()=>{
  const explore=readFileSync(new URL('../src/components/ToursTab.tsx',import.meta.url),'utf8');
  const catalog=readFileSync(new URL('../src/catalogs/saoPauloExplore.ts',import.meta.url),'utf8');
  const photo=readFileSync(new URL('../src/components/ExplorePlacePhoto.tsx',import.meta.url),'utf8');
  assert.ok(catalog.includes('commons.wikimedia.org'));
  assert.match(catalog,/photoCredit/);
  assert.match(explore,/place\.photoPage && place\.photoCredit/);
  assert.match(explore,/<ExplorePlacePhoto place=\{place\}/);
  assert.match(photo,/onError=\{\(\)=>setFailedSrc\(place.photo\)/);
  assert.doesNotMatch(explore,/figma-ibirapuera\.svg|figma-romeiros\.svg/);
  assert.match(photo,/Local sem fotografia disponível/);
});

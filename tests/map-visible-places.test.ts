import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visiblePlacesSignature} from '../src/services/mapVisiblePlaces';
import type {MapVisiblePlace} from '../src/components/InteractiveMap';

const place:MapVisiblePlace={id:'place:123',name:'Parque das Águas',kind:'parque',
  address:'Rua Principal, 10',coords:[-23.55,-46.63]};

test('visible place comparison notices corrected metadata without changing IDs',()=>{
  const initial=visiblePlacesSignature([place]);
  assert.equal(visiblePlacesSignature([{...place,coords:[...place.coords]}]),initial);
  for(const variant of [
    {...place,name:'Parque Novo'},
    {...place,address:'Rua Principal, 12'},
    {...place,kind:'mirante'},
    {...place,coords:[-23.551,-46.63] as [number,number]}
  ])assert.notEqual(visiblePlacesSignature([variant]),initial);
  assert.notEqual(visiblePlacesSignature([]),initial);
});

test('visible place list tracks order and repeated IDs without triggering unrelated updates',()=>{
  const other={...place,id:'place:456',name:'Praça vizinha'};
  assert.equal(visiblePlacesSignature([place,other]),visiblePlacesSignature([{...place},{...other}]));
  assert.notEqual(visiblePlacesSignature([place,other]),visiblePlacesSignature([other,place]));
  for(const file of ['../src/components/InteractiveMap.tsx',
    '../src/components/StandaloneNavigationMap.tsx','../src/components/MapTab.tsx']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/visiblePlacesSignature\(/);
  }
});

test('GPS-only navigation renders do not repeatedly publish visible POIs',()=>{
  const source=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
  assert.match(source,/if\(overlaysChanged\|\|viewportDirty\)\{publishPlaces\(\);viewportDirty=false;\}/);
  assert.match(source,/if\(mapUpdates.paused\(\)\)requestRender\(\)/);
  assert.match(source,/map\.on\('moveend',publishViewport\)/);
  assert.match(source,/const publishViewport=\(\)=>\{/);
});

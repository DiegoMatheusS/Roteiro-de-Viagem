import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('a base do mapa é OpenStreetMap sem chave ou bloqueio por tiles CARTO', () => {
  const source = readFileSync(new URL('../src/components/InteractiveMap.tsx', import.meta.url), 'utf8');
  const providers=readFileSync(new URL('../src/services/mapStyles.ts',import.meta.url),'utf8');
  assert.match(providers, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(providers, /basemaps\.cartocdn\.com|cartodb\.com\/.*tile|apiKey=/i);
  assert.match(source, /TILE_PROVIDERS\[roadStyle \|\| navigationMode \? 'light' : currentStyle\]/);
  assert.match(source, /tileerror/);
  assert.match(source, /Tentar novamente/);
});

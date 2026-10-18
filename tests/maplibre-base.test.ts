import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path:string) => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('mapa claro usa MapLibre e mantém fallback de tiles OSM',()=>{
  const map=source('src/components/InteractiveMap.tsx');
  const bridge=source('src/services/mapLibreBridge.ts');
  assert.match(map, /import\('\.\.\/services\/mapLibreBridge'\)/);
  assert.match(map, /canRenderVectorMap\(\)/);
  assert.match(map, /vector\.getMaplibreMap\(\)/);
  assert.match(map, /showRaster\(\)/);
  assert.match(map, /gl\.on\('error'/);
  assert.match(map, /setTimeout\(fallback, 12000\)/);
  assert.match(bridge, /@maplibre\/maplibre-gl-leaflet/);
  assert.match(bridge, /setWorkerUrl\(workerUrl\)/);
  assert.match(bridge, /if \(!layer\._map\) return/);
  assert.match(bridge, /layer\.getMaplibreMap\(\)\?\.resize\(\)/);
  assert.match(bridge, /tiles\.openfreemap\.org\/styles\/positron/);
  assert.doesNotMatch(bridge, /mapbox.*(token|apikey)|CARTO/ig);
});
test('camadas de navegação/alertas preservadas e sem tela branca quando MapLibre falha',()=>{
  const map=source('src/components/InteractiveMap.tsx');
  assert.match(map, /selectRouteRef\.current\?\.\(option\.id\)/);
  assert.match(map, /splitRouteAtPosition/);
  assert.match(map, /L\.marker\(\[alert\.lat,alert\.lng\]/);
  assert.match(map, /L\.tileLayer\(tileConfig\.url/);
  assert.match(map, /map\.removeLayer\(vector\)/);
  assert.match(map, /currentTileLayerRef\.current = raster/);
});

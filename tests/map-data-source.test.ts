import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('fluxo público usa OSRM e geradores fictícios não existem mais',()=>{
  const route = read('src/services/routeCalculator.ts');
  const tourist = read('src/services/touristCircuit.ts');
  assert.doesNotMatch(route,/generateRouteAlternatives|generateTouristCircuitByKmOrHours/);
  assert.doesNotMatch(route,/Rota Panorâmica.*?Cênica & Serrana|Mirante dos Vales|Ponto Médio \/ Mirante/);
  assert.match(tourist, /routingSource !== 'OSRM'/);
  assert.match(tourist, /'\/routes\/tourist'/);
  const presets = read('src/data/sampleRoutes.ts');
  assert.doesNotMatch(presets,/INITIAL_COMMUNITY_ROUTES|INITIAL_STOPS_MAP|authorTier/);
});
test('mapa público não desenha valores inventados e prioriza ícones vetoriais',()=>{
  const map=read('src/components/InteractiveMap.tsx');
  const markers=read('src/components/mapContributionIcon.ts');
  const data=read('src/services/vectorPlaceData.ts');
  assert.match(data,/priceLabel:fuelPriceLabel\(station\)/);
  assert.match(data,/priceLabel:tollPriceLabel\(toll\)/);
  assert.match(map,/mapPlaceIcon\(place.kind\)/);
  assert.match(markers,/textContent = options.priceLabel/);
  assert.doesNotMatch(markers,/innerHTML\s*=\s*options.priceLabel/);
});

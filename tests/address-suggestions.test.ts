import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAddressDistance} from '../src/services/addressSuggestions';
import type {DeviceLocation} from '../src/services/locationService';
import {readFileSync} from 'node:fs';

const now=1772000000000;
const gps:DeviceLocation={coords:[-23.55,-46.63],accuracyMeters:8,
  speedMetersPerSecond:0,timestamp:now};
test('sugestões distinguem quilometragem em linha reta da rota rodoviária',()=>{
  assert.match(formatAddressDistance([-23.551,-46.631],gps,now),/km em linha reta/);
  assert.match(formatAddressDistance([-23.55,-46.63],gps,now),/0,0 km/);
});
test('GPS impreciso ou antigo não apresenta distância como confiável',()=>{
  assert.match(formatAddressDistance([-23.55,-46.63],{...gps,accuracyMeters:150},now),/indisponível/);
  assert.match(formatAddressDistance([-23.55,-46.63],{...gps,timestamp:now-120000},now),/indisponível/);
});
test('cadastro pesquisará enquanto digita e mostrará distância após as coordenadas',()=>{
  const src=readFileSync(new URL('../src/components/SavedAddressesPanel.tsx',import.meta.url),'utf8');
  assert.match(src,/setTimeout\(\(\)=>\{void search\(\);\},450\)/);
  assert.match(src,/formatAddressDistance\(place.coords,gps\)/);
});

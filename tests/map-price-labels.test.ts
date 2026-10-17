import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelPriceLabel, tollPriceLabel } from '../src/services/mapPriceLabels';
import type { FuelPrice } from '../src/types/fuel';

function price(fuelType: FuelPrice['fuelType'], value: number, stale = false, disputed = false): FuelPrice {
  return { id:'approved', fuelType, price:value, observedAt:'2026-10-17T12:00:00Z', publishedAt:'2026-10-17T12:00:00Z',
    source:'admin', confirmations:1, contests:0, reliabilityScore:80, reliability:'Alta', stale, disputed };
}
test('posto mostra apenas preço confiável, prioriza gasolina comum e não inventa ausência',()=>{
  assert.equal(fuelPriceLabel({ prices:[] }), null);
  assert.equal(fuelPriceLabel({ prices:[price('etanol',3.59),price('gasolina_comum',5.69)] }), 'Gasolina R$ 5,69');
  assert.equal(fuelPriceLabel({ prices:[price('gasolina_comum',5.69,true)] }), null);
  assert.equal(fuelPriceLabel({ prices:[price('gasolina_comum',5.69,false,true)] }), null);
  assert.equal(fuelPriceLabel({ prices:[price('diesel_s10',6.22)] }), 'Diesel S10 R$ 6,22');
});
test('pedágio usa tarifa unitária existente, nunca total do trajeto e nunca data vencida',()=>{
  assert.equal(tollPriceLabel({price:null}),null);
  assert.equal(tollPriceLabel({price:12.5,validUntil:'2026-10-19T00:00:00Z'},Date.parse('2026-10-17')), 'Pedágio R$ 12,50');
  assert.equal(tollPriceLabel({price:12.5,validUntil:'2026-10-16T00:00:00Z'},Date.parse('2026-10-17')), null);
  assert.equal(tollPriceLabel({price:-1}),null);
});

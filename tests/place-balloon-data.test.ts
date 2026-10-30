import test from 'node:test';
import assert from 'node:assert/strict';
import {placeIconKind} from '../src/services/placeIconKind';
import {fuelBalloonRows} from '../src/services/mapPriceLabels';
import type {FuelPrice} from '../src/types/fuel';

test('named squares from older generic park imports use a seesaw without overriding explicit venue types',()=>{
  for(const kind of ['park','other','attraction'] as const){
    assert.equal(placeIconKind(kind,'Praça das Flores'),'square');
    assert.equal(placeIconKind(kind,'Praca da Paz'),'square');
  }
  assert.equal(placeIconKind('park','Parque da Cidade'),'park');
  assert.equal(placeIconKind('theatre','Praça das Artes'),'theatre');
  assert.equal(placeIconKind('museum','Museu da Praça'),'museum');
});
test('three fuel rows preserve actual variants and never turn missing/stale/disputed prices into current values',()=>{
  const p=(fuelType:FuelPrice['fuelType'],price:number,other={})=>({fuelType,price,observedAt:'2026-10-30T12:00:00Z',...other}) as FuelPrice;
  const rows=fuelBalloonRows([p('gasolina_comum',5.799),p('gasolina_aditivada',6.199),p('etanol',3.799,{stale:true}),p('diesel_comum',5.99,{disputed:true}),p('diesel_s10',6.199)]);
  assert.deepEqual(rows,[{label:'Gasolina',value:'R$ 5,799/L'},{label:'Etanol',value:null},{label:'Diesel S10',value:'R$ 6,199/L'}]);
  assert.deepEqual(fuelBalloonRows([]).map(row=>row.value),[null,null,null]);
});

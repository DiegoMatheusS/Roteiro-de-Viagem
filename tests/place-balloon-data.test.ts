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
test('all fuel variants remain distinct; stale and disputed prices are not displayed',()=>{
  const p=(fuelType:FuelPrice['fuelType'],price:number,other={})=>({fuelType,price,observedAt:'2026-10-30T12:00:00Z',...other}) as FuelPrice;
  const rows=fuelBalloonRows([p('gasolina_comum',5.799),p('gasolina_aditivada',6.199),p('etanol',3.799,{stale:true}),p('diesel_comum',5.99,{disputed:true}),p('diesel_s10',6.199)]);
  assert.equal(rows.find(row=>row.label==='Gasolina comum')?.value,'R$ 5,799/L');
  assert.equal(rows.find(row=>row.label==='Gasolina aditivada')?.value,'R$ 6,199/L');
  assert.equal(rows.find(row=>row.label==='Etanol')?.value,null);
  assert.equal(rows.find(row=>row.label==='Diesel comum / S500')?.value,null);
  assert.equal(rows.find(row=>row.label==='Diesel S10')?.value,'R$ 6,199/L');
  assert.equal(rows.find(row=>row.label==='Shell V-Power')?.value,null);
  assert.ok(fuelBalloonRows([]).every(row=>row.value===null));
});

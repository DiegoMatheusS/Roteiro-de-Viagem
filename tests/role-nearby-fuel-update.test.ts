import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fuelBalloonRows} from '../src/services/mapPriceLabels';
import type {FuelPrice} from '../src/types/fuel';
const file=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const entry=(fuelType:FuelPrice['fuelType'],customLabel:string,price:number):FuelPrice=>({
 id:'p',fuelType,customLabel,price,observedAt:'2026-10-30T12:00:00Z',
 publishedAt:'2026-10-30T12:00:00Z',source:'admin',confirmations:1,contests:0,
 reliabilityScore:80,reliability:'Alta',stale:false,disputed:false
});
test('balão lista tipos separadamente e nunca atribui preço comum a V-Power',()=>{
 const rows=fuelBalloonRows([entry('gasolina_comum','',5.69),entry('outro','Shell V-Power',6.49),entry('diesel_s10','',6.29)]);
 assert.equal(rows.find(p=>p.label==='Gasolina comum')?.value,'R$ 5,690/L');
 assert.equal(rows.find(p=>p.label==='Shell V-Power')?.value,'R$ 6,490/L');
 assert.equal(rows.find(p=>p.label==='Gasolina premium')?.value,null);
 assert.equal(rows.find(p=>p.label==='Diesel S10')?.value,'R$ 6,290/L');
 assert.equal(rows.find(p=>p.label==='Diesel comum / S500')?.value,null);
});
test('seleção múltipla percorre interface, request e validador de pontos reais',()=>{
 const home=file('src/components/NavigationHome.tsx');
 const page=file('src/components/CreateTouristCircuitScreen.tsx');
 const client=file('src/services/touristCircuit.ts');
 const backend=file('server/tourist.ts');
 assert.match(page,/aria-pressed=\{selected\}/);
 assert.match(page,/selectedNearbyIds\.length>=3/);
 assert.match(home,/selectedPlaceIds:selectedNearbyIds/);
 assert.match(client,/selectedPlaceIds: request\.selectedPlaceIds/);
 assert.match(backend,/parseIds\(req\.body\.selectedPlaceIds,3\)/);
 assert.match(backend,/chosen\.some\(place=>!place\)/);
 assert.match(backend,/selectedPlaceIds\.length&&!best/);
});
test('envio de valores exige foto e usa moderação existente',()=>{
 const modal=file('src/components/FuelStationModal.tsx');
 assert.match(modal,/if\(!selectedFile\)throw new Error/);
 assert.match(modal,/photoData\.append\('photo',selectedFile\)/);
 assert.match(modal,/method:'POST',body:photoData/);
 assert.match(modal,/\/prices\x60, \{ method: 'POST'/);
});

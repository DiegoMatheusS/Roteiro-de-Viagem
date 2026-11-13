import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync(new URL('../src/components/NavigationHome.tsx',import.meta.url),'utf8');
const circuit=readFileSync(new URL('../src/components/CreateTouristCircuitScreen.tsx',import.meta.url),'utf8');

test('saved places are visible just below the main search without expanding Salvos',()=>{
  const search=home.indexOf('data-testid="home-inline-destination-search"');
  const shortcuts=home.indexOf('data-testid="home-saved-shortcuts"');
  const planner=home.indexOf('Planejar passeio');
  assert.ok(search>=0&&shortcuts>search&&planner>shortcuts,
    'saved places must appear immediately after the search, before journey planning');
  assert.match(home,/data-testid="home-saved-places"/);
  assert.match(home,/savedAddresses\.map\(item=><button/);
  assert.match(home,/aria-label=\{\x60Ir para \$\{item\.label\}\x60\}/);
  assert.match(home,/onClick=\{\(\)=>selectMapTarget\(\{name:item\.label,address:item\.address,coords:item\.coords\}\)\}/);
  assert.match(home,/onChanged=\{setSavedAddresses\}/);
  assert.match(home,/aria-label="Gerenciar locais salvos"/);
});

test('home keeps Comboio and lacks standalone Alertas control',()=>{
  assert.match(home,/aria-label="Comboio" onClick=\{\(\)=>setShowConvoyActions\(true\)\}/);
  assert.doesNotMatch(home,/aria-label="Alertas"/);
  const km=home.indexOf('aria-label="Por distância — Escolher KM"');
  const hours=home.indexOf('aria-label="Por tempo — Escolher horas"');
  const convoy=home.indexOf('aria-label="Comboio"');
  assert.ok(km>0&&hours>km&&convoy>hours,'KM and time stay ahead of Comboio');
});

test('distance and duration both accept typed values, with presets optional',()=>{
  assert.match(circuit,/input aria-label=\{mode==='km'\?'Quantidade de quilômetros':'Quantidade de horas'\}/);
  assert.match(circuit,/type="text" inputMode="decimal" value=\{value\}/);
  assert.match(circuit,/onChange=\{event=>mode==='km'\?onKmChange\(event\.target\.value\):onHoursChange\(event\.target\.value\)\}/);
  assert.match(circuit,/Digite \{mode==='km'/);
});

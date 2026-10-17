import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('single Comboio button sits immediately after KM/Hours in the public home',()=>{
  const home=source('src/components/NavigationHome.tsx');
  const km=home.indexOf("Escolher KM");
  const hours=home.indexOf("Escolher horas");
  const convoy=home.indexOf('onClick={()=>setShowConvoyActions(true)}');
  const destination=home.indexOf("showSheet('destination')} className=");
  assert.ok(km>=0&&hours>km&&convoy>hours&&destination>convoy,'botão logo abaixo de KM/horas e antes do destino');
  assert.match(home,/<ConvoyActionModal[\s\S]*onCreate=\{\(\)=>\{setShowConvoyActions\(false\);setShowCreateConvoy\(true\);\}\}/);
  assert.match(home,/onJoin=\{\(\)=>\{setShowConvoyActions\(false\);props\.onJoinConvoy\(\);\}\}/);
  assert.match(home,/<CreateConvoyModal[\s\S]*onCreate=\{props\.onCreateConvoy\}/);
  assert.match(home,/if\(showCreateConvoy\)\{\(event as CustomEvent\)\.preventDefault\(\);setShowCreateConvoy\(false\);return;\}/);
  assert.match(home,/if\(showConvoyActions\)\{\(event as CustomEvent\)\.preventDefault\(\);setShowConvoyActions\(false\);return;\}/);
});
test('the Comboio options popup offers exactly create and enter',()=>{
  const chooser=source('src/components/ConvoyActionModal.tsx');
  assert.match(chooser,/role="dialog" aria-modal="true" aria-label="Opções do comboio"/);
  assert.match(chooser,/onClick={onCreate}/);
  assert.match(chooser,/onClick={onJoin}/);
  assert.match(chooser,/>Criar comboio<\/strong>/);
  assert.match(chooser,/>Entrar no comboio<\/strong>/);
  assert.match(chooser,/aria-label="Fechar opções do comboio"/);
  assert.match(chooser,/event.key==='Escape'/);
});
test('the creation modal handles planned trips, custom names and login requirements',()=>{
  const popup=source('src/components/CreateConvoyModal.tsx');
  assert.match(popup,/role="dialog" aria-modal="true" aria-label="Criar Comboio"/);
  assert.match(popup,/available\.map\(trip => <option/);
  assert.match(popup,/Nome do comboio/);
  assert.match(popup,/onCreate\(selected, normalized\)/);
  assert.match(popup,/Planejar uma rota/);
  assert.match(popup,/Entrar para criar/);
  assert.match(popup,/Já tenho um código/);
  assert.match(popup,/onMouseDown=\{event =>/);
  assert.match(popup,/event\.key === 'Escape'/);
  assert.match(popup,/sharing|compartilhamento da localização começa desligado/i);
  assert.match(popup,/Number\.isFinite\(point\[0\]\)/);
});
test('creation reuses authenticated server flow and never seeds fabricated roads',()=>{
  const app=source('src/App.tsx');
  assert.match(app,/onCreateConvoy=\{\(trip,title\) => handleCreateConvoy\(trip,title\)\}/);
  assert.match(app,/onJoinConvoy=\{\(\) => \{setJoinError\(''\);setShowJoin\(true\);\}\}/);
  assert.match(app,/await convoyService\.createConvoy\(\{ title, trip,/);
  assert.match(app,/if \(!auth\.user\)/);
  assert.match(app,/if \(!currentVehicle\)/);
  assert.match(app,/setActiveConvoyId\(convoy\.id\)/);
});

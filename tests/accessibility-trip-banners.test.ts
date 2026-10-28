import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('viagem em andamento aparece no topo e não sobrepõe as páginas',()=>{
  const app=source('src/App.tsx');
  const banner=source('src/components/ActiveTripResumeBanner.tsx');
  const css=source('src/role-figma.css');
  assert.match(app,/showTripResumeBanner && activeTrip && <ActiveTripResumeBanner/);
  assert.ok(app.indexOf('<ActiveTripResumeBanner')<app.indexOf('<main className='));
  assert.doesNotMatch(banner,/(fixed bottom|absolute top)/);
  assert.match(banner,/Viagem em andamento/);
  assert.match(banner,/min-h-12/);
  assert.match(css,/data-trip-resume-banner="true"/);
  assert.match(css,/height:100%;\s*min-height:0/);
});

test('menu inicial e navegação têm texto ampliado e alvos maiores',()=>{
  const css=source('src/role-figma.css');
  assert.match(css,/font: 600 14px\/1\.3/);
  assert.match(css,/rdv-figma-card-title\{font-size:19px/);
  assert.match(css,/rdv-figma-card-detail\{font-size:15px/);
  assert.match(css,/rdv-app-shell \.text-xs \{font-size:14px/);
  assert.match(css,/rdv-app-shell \.text-sm \{font-size:16px/);
  assert.match(css,/rdv-figma-mode\{min-height:44px/);
});

test('atalhos Salvos são grandes e exclusão exige 2 segundos sem lixeira',()=>{
  const saved=source('src/components/SavedAddressesPanel.tsx');
  assert.match(saved,/min-h-\[92px\]/);
  assert.match(saved,/},2000\)/);
  assert.doesNotMatch(saved,/<Trash/);
  assert.match(saved,/Segure por 2 segundos para excluir/);
  assert.match(saved,/items\.map\(item=>/);
});

test('avisos de pedágios e trânsito sem dados não poluem a prévia',()=>{
  const preview=source('src/components/TripPreviewScreen.tsx');
  const home=source('src/components/NavigationHome.tsx');
  const route=source('src/services/routeChoices.ts');
  const explore=source('src/components/DestinationExplorer.tsx');
  assert.doesNotMatch(preview,/tollNotice/);
  assert.doesNotMatch(home,/Cobertura de pedágios indisponível/);
  assert.doesNotMatch(route,/Trânsito em tempo real indisponível/);
  assert.doesNotMatch(explore,/Trânsito ao vivo: indisponível/);
});

test('resultados digitados aparecem sobre os painéis sem sofrer corte por rolagem',()=>{
  const overlay=source('src/components/SearchResultsOverlay.tsx');
  const home=source('src/components/NavigationHome.tsx');
  const map=source('src/components/MapTab.tsx');
  assert.match(overlay,/createPortal\(/);
  assert.match(overlay,/zIndex:175/);
  assert.match(overlay,/getBoundingClientRect\(\)/);
  assert.match(overlay,/window\.visualViewport/);
  assert.match(home,/<SearchResultsOverlay anchorRef=\{searchFormRef\}/);
  assert.match(map,/<SearchResultsOverlay anchorRef=\{searchFormRef\}/);
  assert.match(home,/searchBusy&&<p role="status"[^>]*>Pesquisando endereço/);
  assert.match(map,/searchBusy&&<p role="status"[^>]*>Pesquisando endereço/);
  assert.match(home,/searchError&&<p role="alert"/);
  assert.match(map,/searchError&&<p role="alert"/);
  assert.doesNotMatch(map,/max-h-44 overflow-y-auto/);
});

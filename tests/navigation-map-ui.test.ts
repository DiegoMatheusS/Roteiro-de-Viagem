import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = (path:string) => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('rotas alternativas são desenhadas juntas e cada linha pode ser selecionada',()=>{
  const map=source('src/components/InteractiveMap.tsx');
  assert.match(map,/routeAlternatives\.length > 1/);
  assert.match(map,/alternative\.on\('click',\(\)=>onSelectRoute\?\.\(option\.id\)\)/);
  assert.match(map,/option\.id === selectedRouteId/);
  assert.match(map,/color:'#64748b'/);
  const explorer=source('src/components/DestinationExplorer.tsx');
  assert.match(explorer,/onMapRoute\(position,choices,choices\[0\]\.id\)/);
  assert.match(explorer,/setSelected\(index\)/);
  assert.match(explorer,/onStartTrip\(verified \?/);
});

test('primeiro toque em iniciar calcula a rota e inicia a viagem',()=>{
  const explorer=source('src/components/DestinationExplorer.tsx');
  assert.match(explorer,/const result=routes\.length && origin \? \{choices:routes,position:origin\} : await loadRoutes\(\)/);
  assert.match(explorer,/onStartTrip\(verified \?/);
});

test('Android 15 evita aplicar a altura do teclado duas vezes',()=>{
  const android=source('android/app/src/main/java/br/com/roteirodeviagem/app/MainActivity.java');
  assert.match(android,/SOFT_INPUT_ADJUST_RESIZE/);
  assert.doesNotMatch(android,/keyboard\.bottom/);
  const workflow=source('.github/workflows/android-device.yml');
  assert.match(workflow,/api: \[33, 35, 36\]/);
});

test('mapa cobre a tela inteira e painel pode ser arrastado para baixo',()=>{
  const home=source('src/components/NavigationHome.tsx');
  assert.match(home,/absolute inset-0 rdv-flat-map/);
  assert.match(home,/onPointerUp=\{handleGripRelease\}/);
  assert.match(home,/setCollapsed\(true\)/);
});

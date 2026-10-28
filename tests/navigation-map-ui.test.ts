import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = (path:string) => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('rotas alternativas são desenhadas juntas e cada linha pode ser selecionada',()=>{
  const map=source('src/components/InteractiveMap.tsx');
  assert.match(map,/routeAlternatives\.length > 1/);
  assert.match(map,/alternative\.on\('click',\(\)=>selectRouteRef.current\?\.\(option\.id\)\)/);
  assert.match(map,/option\.id === selectedRouteId/);
  assert.match(map,/color:'#64748b'/);
  const explorer=source('src/components/DestinationExplorer.tsx');
  assert.match(explorer,/onMapRoute\(position,choices,choices\[0\]\.id\)/);
  assert.match(explorer,/setSelected\(index\)/);
  assert.match(explorer,/onStartTrip\(verified \?/);
});

test('primeiro toque em iniciar calcula a rota e inicia a viagem',()=>{
  const explorer=source('src/components/DestinationExplorer.tsx');
  assert.match(explorer,/const result=routes\.length && origin \? \{choices:routes,position:origin,name:originName\} : await loadRoutes\(\)/);
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
  assert.match(home,/onPointerUp=\{finishPanelDrag\}/);
  assert.match(home,/setCollapsed\(true\)/);
});

test('mapa troca rota sem refazer zoom, não mostra avisos de postos em loop',()=>{
  const map=source('src/components/InteractiveMap.tsx');
  assert.doesNotMatch(map,/JSON\.stringify\(\[originCoords,destinationCoords,routePath,routeAlternatives\.map\(r=>\[r\.id,r\.routePath\]\),selectedRouteId/);
  assert.doesNotMatch(map,/\{fuel\.error &&/);
  const home=source('src/components/NavigationHome.tsx');
  assert.match(home,/onSelectCoordinates=\{\(\)=>\{setCollapsed\(true\)/);
  assert.match(home,/onPointerMove=/);
  assert.match(home,/select-none/);
});

test('navegação, alertas e botão Google funcionam sem login obrigatório',()=>{
  const route=source('src/components/DestinationExplorer.tsx');
  assert.match(route,/GUEST_NAVIGATION_VEHICLE/);
  const alerts=source('server/roadAlerts.ts');
  assert.match(alerts,/app\.post\('\/api\/road-alerts', \(req, res\)/);
  const google=source('src/components/GoogleSignInButton.tsx');
  assert.match(google,/TravelNative\.signInGoogle/);
});

test('navegação não mostra aviso persistente de voz indisponível',()=>{
  const voice=source('src/components/VoiceGuidanceControl.tsx');
  assert.match(voice,/disabled=\{!supported\}/);
  assert.doesNotMatch(voice,/setUnavailable|rdv-nav-voice-note|<span role="status".*Voz indisponível/);
  assert.match(voice,/if\(!supported\)return;/);
});

test('rodapé da navegação é cinza-claro e Encerrar é vermelho em ambos os temas',()=>{
  const screen=source('src/components/ActiveTripModal.tsx');
  assert.match(screen,/aria-label="Encerrar viagem"[\s\S]*?className="rdv-nav-bottom-button rdv-nav-end"/);
  const css=source('src/role-navigation-figma.css');
  assert.match(css,/\.rdv-nav-bottom \{[\s\S]*?background:#e5e7eb;/);
  assert.match(css,/\.rdv-nav-bottom-button\.rdv-nav-end \{\s*background:#c62828;\s*color:#fff;/);
  assert.match(css,/\[data-role-theme="dark"\] \.rdv-nav-bottom-button\.rdv-nav-end \{background:#c62828;color:#fff;\}/);
});

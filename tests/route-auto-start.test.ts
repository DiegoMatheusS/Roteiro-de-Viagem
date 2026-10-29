import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTE_AUTO_START_MS,routeAutoStartSeconds} from '../src/services/routeAutoStart';

test('rotas prontas iniciam após 10 segundos completos, inclusive em tempo de sistema irregular',()=>{
  assert.equal(ROUTE_AUTO_START_MS,10000);
  const end=1700000010000;
  assert.equal(routeAutoStartSeconds(end,1700000000000),10);
  assert.equal(routeAutoStartSeconds(end,1700000000001),10);
  assert.equal(routeAutoStartSeconds(end,1700000001000),9);
  assert.equal(routeAutoStartSeconds(end,1700000009001),1);
  assert.equal(routeAutoStartSeconds(end,end),0);
  assert.equal(routeAutoStartSeconds(end,end+10000),0);
});

test('prévia mostra relógio contornando o botão e permite começar antes do prazo',()=>{
  const explorer=readFileSync(new URL('../src/components/DestinationExplorer.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/role-figma.css',import.meta.url),'utf8');
  const border=readFileSync(new URL('../src/components/RouteCountdownBorder.tsx',import.meta.url),'utf8');
  assert.match(explorer,/setInterval\(/);
  assert.match(explorer,/routeAutoStartSeconds\(deadline,Date\.now\(\)\)/);
  assert.match(explorer,/if\(seconds===0\)\{clearInterval\(timer\);countdownTimer\.current=null;void depart\(\);\}/);
  assert.match(explorer,/onClick=\{\(\)=>void depart\(\)\}/);
  assert.match(explorer,/aria-label=\{busy\?'Preparando sua navegação':routes\.length\?'Iniciar rota selecionada'/);
  assert.match(explorer,/<RouteCountdownBorder key=\{countdownDeadline\} durationMs=\{ROUTE_AUTO_START_MS\}/);
  assert.match(border,/className="rdv-route-countdown-border"/);
  assert.match(explorer,/role="timer"/);
  assert.match(css,/@keyframes rdv-route-button-clock/);
});

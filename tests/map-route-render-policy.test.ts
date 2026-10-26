import test from 'node:test';
import assert from 'node:assert/strict';
import {decideRouteRender,routeRenderGapMs,stableList,mapPixelRatio,
  MIN_ROUTE_RENDER_GAP_MS,MAX_ROUTE_RENDER_GAP_MS} from '../src/services/mapRouteRenderPolicy';

const base={routeChanged:false,interacting:false,navigationMode:true,now:10_000,lastRenderAt:0,routeVertices:5000};

test('o intervalo entre envios cresce com o tamanho da rota, dentro de limites',()=>{
  assert.equal(routeRenderGapMs(0),MIN_ROUTE_RENDER_GAP_MS);
  assert.equal(routeRenderGapMs(Number.NaN),MIN_ROUTE_RENDER_GAP_MS);
  assert.equal(routeRenderGapMs(3000),MIN_ROUTE_RENDER_GAP_MS);
  assert.equal(routeRenderGapMs(10_000),400);
  assert.equal(routeRenderGapMs(20_000),800);
  assert.equal(routeRenderGapMs(500_000),MAX_ROUTE_RENDER_GAP_MS);
});

test('enquanto o usuário mexe no mapa o progresso é adiado, não descartado',()=>{
  assert.equal(decideRouteRender({...base,interacting:true}),'defer');
  assert.equal(decideRouteRender({...base,interacting:true,now:base.lastRenderAt+60_000}),'defer');
});

test('uma rota nova aparece de imediato, mesmo durante o gesto',()=>{
  assert.equal(decideRouteRender({...base,routeChanged:true,interacting:true}),'render');
  assert.equal(decideRouteRender({...base,routeChanged:true,now:base.lastRenderAt}),'render');
});

test('na navegação o progresso respeita o intervalo; fora dela nunca fica atrás',()=>{
  const long={...base,routeVertices:20_000};
  assert.equal(decideRouteRender({...long,now:long.lastRenderAt+799}),'skip');
  assert.equal(decideRouteRender({...long,now:long.lastRenderAt+800}),'render');
  assert.equal(decideRouteRender({...base,navigationMode:false,now:base.lastRenderAt}),'render');
  // After a deferred gesture the caller resets the clock and gets an immediate update.
  assert.equal(decideRouteRender({...long,lastRenderAt:-Infinity}),'render');
});

test('listas vazias recriadas a cada render viram a mesma instância',()=>{
  assert.equal(stableList([]),stableList([]));
  assert.equal(stableList(undefined),undefined);
  assert.equal(stableList(null),undefined);
  const items=[1,2];
  assert.equal(stableList(items),items);
});

test('a navegação limita o canvas a 2x sem reduzir o mapa de planejamento',()=>{
  assert.equal(mapPixelRatio(3.5,true),2);
  assert.equal(mapPixelRatio(2,true),2);
  assert.equal(mapPixelRatio(1.5,true),1.5);
  assert.equal(mapPixelRatio(3,false),3);
  assert.equal(mapPixelRatio(0,true),1);
  assert.equal(mapPixelRatio(Number.NaN,false),1);
});

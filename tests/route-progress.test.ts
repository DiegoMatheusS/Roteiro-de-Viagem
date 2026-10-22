import test from 'node:test';
import assert from 'node:assert/strict';
import { routeProgressIndex,routeProgressRenderKey,splitRouteAtPosition } from '../src/services/routeProgress';

test('pinta como percorrido só até a projeção real do GPS sobre um segmento',()=>{
  const path:[number,number][]=[[0,0],[0,.01],[0,.02],[0,.03]];
  const result=splitRouteAtPosition(path,[0,.01999],2,3);
  assert.equal(result.travelled.length,3);
  assert.equal(result.remaining.length,3);
  assert.ok(Math.abs(result.travelled.at(-1)![1]-.01999)<1e-8);
  assert.deepEqual(result.remaining[0],result.travelled.at(-1));
  assert.deepEqual(result.remaining.slice(1),path.slice(2));
});

test('em trecho de rodovia com poucos vértices o ponto é interpolado na via real',()=>{
  const highway:[number,number][]=[[0,0],[0,.1]];
  const position:[number,number]=[0,.05];
  const split=splitRouteAtPosition(highway,position,5.5,11);
  assert.deepEqual(split.travelled,[[0,0],position]);
  assert.deepEqual(split.remaining,[position,[0,.1]]);
  assert.ok(routeProgressRenderKey(highway,position,5.5,11));
});

test('ao sair da rua nem a geometria próxima inventa trecho já percorrido',()=>{
  const road:[number,number][]=[[0,0],[0,.01]];
  assert.equal(routeProgressIndex(road,[.002,.005],.5,1),null,
    'Desvio de aproximadamente 222m não deve parecer que está na rua');
  assert.deepEqual(splitRouteAtPosition(road,[.002,.005],.5,1),
    {travelled:[],remaining:road});
  assert.equal(routeProgressRenderKey(road,[.002,.005],.5,1),null);
  assert.equal(routeProgressIndex(road,[NaN,.005],.5,1),null);
});

test('no início e fim preserva vértices exatos sem duplicar coordenadas',()=>{
  const road:[number,number][]=[[0,0],[0,.01],[0,.02]];
  assert.deepEqual(splitRouteAtPosition(road,road[0],0,2),
    {travelled:[road[0]],remaining:road});
  assert.deepEqual(splitRouteAtPosition(road,road[2],2,2),
    {travelled:road,remaining:[road[2]]});
});

test('chave de renderização muda a cada 20m e ignora pequenas oscilações',()=>{
  const road:[number,number][]=[[0,0],[0,.2]];
  const key=routeProgressRenderKey(road,[0,0],0,22);
  assert.equal(routeProgressRenderKey(road,[0,.00005],0,22),key);
  assert.notEqual(routeProgressRenderKey(road,[0,.0003],0,22),key);
});

test('cruzamento repetido usa o avanço para manter o trecho do retorno',()=>{
  const circuit:[number,number][]=[[0,0],[0,.01],[0,.02],[0,.01],[0,0]];
  const p:[number,number]=[0,.01];
  const start=routeProgressIndex(circuit,p,1,4);
  const end=routeProgressIndex(circuit,p,3,4);
  assert.equal(start,1);
  assert.equal(end,3);
});

test('fora da rota não afirma progresso concluído', () => {
  const path: [number, number][] = [[0, 0], [0, 0.01], [0, 0.02]];
  assert.deepEqual(splitRouteAtPosition(path, [1, 1], 0.5, 3), { travelled: [], remaining: path });
});

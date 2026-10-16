import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRouteAtPosition } from '../src/services/routeProgress';

test('pinta como percorrido somente até a posição real próxima à rota', () => {
  const path: [number, number][] = [[0, 0], [0, 0.01], [0, 0.02], [0, 0.03]];
  const result = splitRouteAtPosition(path, [0, 0.01999], 2, 3);
  assert.equal(result.travelled.length, 3);
  assert.equal(result.remaining.length, 2);
  assert.deepEqual(result.remaining[0], path[2]);
});

test('fora da rota, não afirma progresso concluído', () => {
  const path: [number, number][] = [[0, 0], [0, 0.01], [0, 0.02]];
  assert.deepEqual(splitRouteAtPosition(path, [1, 1], 0.5, 3), { travelled: [], remaining: path });
});

test('divide no meio de um segmento longo mesmo sem vértice próximo', () => {
  const path: [number, number][] = [[0, 0], [0, 0.1]];
  const result = splitRouteAtPosition(path, [0, 0.04], 4.4, 11.1);
  assert.equal(result.travelled.length, 2);
  assert.equal(result.remaining.length, 2);
  assert.ok(Math.abs(result.travelled[1][1] - 0.04) < 1e-8);
  assert.deepEqual(result.travelled.at(-1), result.remaining[0]);
});

test('no trecho de volta sobreposto usa a distância percorrida', () => {
  const path: [number, number][] = [[0, 0], [0, 0.1], [0, 0]];
  const result = splitRouteAtPosition(path, [0, 0.04], 17.8, 22.2);
  assert.equal(result.travelled.length, 3);
  assert.equal(result.remaining.length, 2);
  assert.deepEqual(result.travelled[1], path[1]);
});

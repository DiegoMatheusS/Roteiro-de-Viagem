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

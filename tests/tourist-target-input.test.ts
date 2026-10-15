import test from 'node:test';
import assert from 'node:assert/strict';
import { canTypeTouristTarget, getTouristTargetError, parseTouristTarget } from '../src/services/touristTargetInput';

test('campo de km permite digitar valores parciais sem mudar automaticamente para 10', () => {
  for (const draft of ['', '0', '1', '9', '9,', '9,5', '10', '10,5', '500', '1000']) assert.equal(canTypeTouristTarget(draft), true);
  assert.equal(parseTouristTarget('9'), 9);
  assert.equal(parseTouristTarget('9,5'), 9.5);
  assert.equal(parseTouristTarget(''), null);
  assert.match(getTouristTargetError('km', '9')!, /KM muito baixo/);
  assert.match(getTouristTargetError('km', '0')!, /KM muito baixo/);
  assert.equal(getTouristTargetError('km', '10'), null);
  assert.equal(getTouristTargetError('km', '500'), null);
  assert.match(getTouristTargetError('km', '501')!, /máximo/);
});
test('campo de horas preserva virgula, zero e fracoes pequenas, sem aumentar para 0,5 hora', () => {
  for (const draft of ['0', '0,', '0,2', '0.25', '0,5', '1', '12', '13']) assert.equal(canTypeTouristTarget(draft), true);
  assert.equal(parseTouristTarget('0,2'), 0.2);
  assert.equal(parseTouristTarget('0,5'), 0.5);
  assert.match(getTouristTargetError('hours', '0,2')!, /Quantidade em Horas muito baixo/);
  assert.equal(getTouristTargetError('hours', '0,5'), null);
  assert.match(getTouristTargetError('hours', '13')!, /máximo/);
  for (const value of ['2..5','7,5,2', '1e3', '-2', 'a']) assert.equal(canTypeTouristTarget(value), false);
});

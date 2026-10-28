import test from 'node:test';
import assert from 'node:assert/strict';
import {draggedHomeSheetHeight,HOME_SHEET_EXPANDED_HEIGHT} from '../src/services/homeSheetSizing';

test('home sheet drag changes height instead of translating the panel away from screen bottom',()=>{
  assert.equal(HOME_SHEET_EXPANDED_HEIGHT,'82dvh');
  assert.equal(draggedHomeSheetHeight('resting',0),undefined);
  assert.equal(draggedHomeSheetHeight('resting',-180),
    'clamp(74px, calc(clamp(304px,42dvh,365px) + 180px), 82dvh)');
  assert.equal(draggedHomeSheetHeight('expanded',120),
    'clamp(74px, calc(82dvh - 120px), 82dvh)');
  assert.equal(draggedHomeSheetHeight('collapsed',-120),
    'clamp(74px, calc(74px + 120px), 82dvh)');
});
test('drag refuses malformed sizes and never produces invalid CSS',()=>{
  for(const bad of [NaN,Infinity,-Infinity,0])assert.equal(draggedHomeSheetHeight('resting',bad),undefined);
});

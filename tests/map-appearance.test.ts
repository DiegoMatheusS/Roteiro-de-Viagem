import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMapAppearance,resolveMapTheme } from '../src/services/mapAppearance';

test('tema claro é padrão; configuração desconhecida também retorna claro',()=>{
  assert.equal(parseMapAppearance(null),'light');
  assert.equal(parseMapAppearance('night'),'light');
  assert.equal(resolveMapTheme('light',new Date('2026-10-21T23:00:00')),'light');
});
test('escuro manual e sistema respeitam opção do motorista',()=>{
  assert.equal(resolveMapTheme('dark'),'dark');
  assert.equal(resolveMapTheme('system',new Date(),true),'dark');
  assert.equal(resolveMapTheme('system',new Date(),false),'light');
});
test('automático usa horário local; não depende de rede, GPS ou backend',()=>{
  const at=(hour:number)=>new Date(2026,9,21,hour,0,0);
  assert.equal(resolveMapTheme('automatic',at(5)),'dark');
  assert.equal(resolveMapTheme('automatic',at(6)),'light');
  assert.equal(resolveMapTheme('automatic',at(17)),'light');
  assert.equal(resolveMapTheme('automatic',at(18)),'dark');
});

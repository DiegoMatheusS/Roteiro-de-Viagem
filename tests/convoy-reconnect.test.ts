import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {viewedConvoyAfterRefresh} from '../src/services/convoyReconnect';

const convoy={id:'comboio-123',status:'active' as const};
test('queda de internet não remove participante nem fecha comboio aberto',()=>{
  assert.equal(viewedConvoyAfterRefresh(convoy.id,[],false),convoy.id);
  assert.equal(viewedConvoyAfterRefresh(convoy.id,[convoy],false),convoy.id);
  assert.equal(viewedConvoyAfterRefresh(null,[convoy],false),null);
});
test('ao reconectar com resposta confirmada mantém membro ativo, encerra somente se saiu',()=>{
  assert.equal(viewedConvoyAfterRefresh(convoy.id,[convoy],true),convoy.id);
  assert.equal(viewedConvoyAfterRefresh(convoy.id,[],true),null);
  assert.equal(viewedConvoyAfterRefresh(convoy.id,[{...convoy,status:'completed' as const}],true),null);
  assert.equal(viewedConvoyAfterRefresh(null,[convoy],true),null,
    'não entrar em comboio novo sem ação do usuário');
});
test('retorno da conexão atualiza o comboio sem pedir código ou consentimento GPS de novo',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../src/components/ConvoyScreen.tsx',import.meta.url),'utf8');
  const gps=readFileSync(new URL('../src/hooks/useConvoyGps.ts',import.meta.url),'utf8');
  assert.match(app,/window.addEventListener\('online',refresh\)/);
  assert.match(app,/viewedConvoyAfterRefresh\(open,convoys,true\)/);
  assert.match(app,/viewedConvoyAfterRefresh\(open,convoyService.getConvoys\(\),false\)/);
  assert.match(screen,/window.addEventListener\('online',resume\)/);
  assert.match(screen,/window.addEventListener\('offline',offline\)/);
  assert.match(screen,/Sem internet · sua sessão de comboio está preservada neste aparelho/);
  assert.match(gps,/window.addEventListener\('online',resume\)/);
  assert.match(gps,/getLocationSession\(\)/);
  assert.doesNotMatch(gps,/joinConvoyByCode/);
});

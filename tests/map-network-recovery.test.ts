import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMapLoadFailure,shouldReloadAfterReconnect} from '../src/services/mapNetworkRecovery';

test('quedas de internet e erros de tiles não substituem o mapa de navegação',()=>{
  let failures=0;
  for(let i=0;i<20;i++){
    const decision=assessMapLoadFailure({loaded:true,changingStyle:false,online:false,consecutiveErrors:failures});
    failures=decision.consecutiveErrors;
    assert.equal(decision.fallback,false);
    assert.equal(decision.retryOnReconnect,true);
  }
  assert.equal(failures,0);
});

test('mapa online só usa fallback após três erros consecutivos no renderizador',()=>{
  let failures=0;
  for(let i=0;i<3;i++){
    const decision=assessMapLoadFailure({loaded:true,changingStyle:false,online:true,consecutiveErrors:failures});
    failures=decision.consecutiveErrors;
    assert.equal(decision.fallback,i===2);
    assert.equal(decision.retryOnReconnect,false);
  }
  assert.equal(failures,3);
  assert.equal(assessMapLoadFailure({loaded:false,changingStyle:false,online:true,consecutiveErrors:2}).fallback,false);
  assert.equal(assessMapLoadFailure({loaded:true,changingStyle:true,online:true,consecutiveErrors:2}).fallback,false);
});

test('reconexão só recarrega estilo se houver tiles interrompidos ou estilo incompleto',()=>{
  assert.equal(shouldReloadAfterReconnect(true,true,true),true);
  assert.equal(shouldReloadAfterReconnect(true,false,false),true);
  assert.equal(shouldReloadAfterReconnect(true,false,true),false);
  assert.equal(shouldReloadAfterReconnect(false,true,false),false);
});

test('MapLibre mantém câmera e GPS ao recuperar conexão sem reiniciar a viagem',()=>{
  const s=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
  assert.match(s,/window.addEventListener\('offline',onNetworkOffline\)/);
  assert.match(s,/window.addEventListener\('online',onNetworkOnline\)/);
  assert.match(s,/window.removeEventListener\('online',onNetworkOnline\)/);
  assert.match(s,/setBase\(activeStyle,activeTheme,true\)/);
  assert.match(s,/map\.triggerRepaint\(\)/);
  assert.match(s,/decision\.retryOnReconnect/);
  assert.match(s,/Sem internet · novas áreas do mapa e rotas podem não carregar/);
  assert.doesNotMatch(s,/location\.reload\(/);
});

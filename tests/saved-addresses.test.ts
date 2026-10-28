import test from 'node:test';
import assert from 'node:assert/strict';
import {readSavedAddresses,saveAddress,deleteSavedAddress,matchSavedAddressOrigin} from '../src/services/savedAddresses';
import type {DeviceLocation} from '../src/services/locationService';
import {readFileSync} from 'node:fs';

function storage(){
  const entries=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>{entries.set(key,value);},
    removeItem:(key:string)=>{entries.delete(key);}
  }});
  return entries;
}
const coords:[number,number]=[-23.55,-46.63];
const fix=(extra:Partial<DeviceLocation>={}):DeviceLocation=>({
  coords,accuracyMeters:9,timestamp:Date.now(),speedMetersPerSecond:0,
  ...extra
});
test('endereços com nome e coordenadas verificadas ficam isolados por conta',()=>{
  storage();
  const first=saveAddress('account-a',{label:'Casa',address:'Rua das Flores 1',coords});
  assert.equal(first.length,1);
  assert.equal(readSavedAddresses('account-b').length,0);
  assert.equal(readSavedAddresses(null).length,0);
  const replaced=saveAddress('account-a',{label:'Casa',address:'Rua das Flores 2',coords});
  assert.equal(replaced.length,1);
  assert.equal(replaced[0].address,'Rua das Flores 2');
  assert.equal(deleteSavedAddress('account-a',replaced[0].id).length,0);
  assert.throws(()=>saveAddress('account-a',{label:'Escola',address:'Inválido',coords:[95,0]}));
});
test('origem Casa só pode substituir GPS atual quando o sinal é confiável e próximo',()=>{
  storage();
  const saved=saveAddress('a',{label:'Casa',address:'Rua A',coords});
  assert.equal(matchSavedAddressOrigin(fix(),saved)?.label,'Casa');
  assert.equal(matchSavedAddressOrigin(fix({accuracyMeters:75}),saved),null);
  assert.equal(matchSavedAddressOrigin(fix({timestamp:Date.now()-60_000}),saved),null);
  assert.equal(matchSavedAddressOrigin(fix({speedMetersPerSecond:5}),saved),null);
  assert.equal(matchSavedAddressOrigin(fix({coords:[-23.552,-46.63]}),saved),null);
});
test('casas vizinhas indistinguíveis pela precisão não podem ser confundidas',()=>{
  const close=[
    {id:'a',label:'Casa',address:'A',coords:[-23.55,-46.63] as [number,number]},
    {id:'b',label:'Trabalho',address:'B',coords:[-23.55002,-46.63] as [number,number]}
  ];
  assert.equal(matchSavedAddressOrigin(fix(),close),null);
});
test('aba Mapa exibe favoritos abaixo da busca e o início mantém a origem escolhida',()=>{
  const map=readFileSync(new URL('../src/components/MapTab.tsx',import.meta.url),'utf8');
  const search=map.indexOf('aria-label="Busca rápida de destinos no mapa"');
  const saved=map.indexOf('<SavedAddressesPanel');
  assert.ok(search>=0&&saved>search);
  assert.match(map,/getOriginLabel=\{\(\)=>savedOriginName\.current\}/);
  const home=readFileSync(new URL('../src/components/NavigationHome.tsx',import.meta.url),'utf8');
  assert.match(home,/matchSavedAddressOrigin\(fix,savedAddresses\)/);
});

test('home destination suggestions expose Salvos and reuse account-scoped saved addresses',()=>{
  const home=readFileSync(new URL('../src/components/NavigationHome.tsx',import.meta.url),'utf8');
  assert.match(home,/aria-label="Salvos"/);
  assert.match(home,/aria-label="Endereços salvos na busca"/);
  assert.match(home,/<SavedAddressesPanel/);
  assert.match(home,/onSelect=\{selectMapTarget\}/);
  assert.match(home,/onChanged=\{setSavedAddresses\}/);
  assert.match(home,/setShowSavedDestinations\(false\)/);
});

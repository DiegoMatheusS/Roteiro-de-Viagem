import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {rememberAddress,readAddressHistory,storedAddressMatches,syncAddressHistory,clearAddressHistory} from '../src/services/addressMemory';
import {storageService} from '../src/services/storageService';
import {searchLocations} from '../src/services/locationSearch';

const place={name:'Rua da Memória, 188, São Paulo',address:'Rua da Memória, 188, São Paulo, SP, 05555-777',coords:[-23.55,-46.63] as [number,number],category:'manual'};
const storage=()=>{const values=new Map<string,string>();return {
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,String(value));},removeItem:(key:string)=>{values.delete(key);},clear:()=>values.clear(),key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size;}
};};
function mockStorage(t:TestContext){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as any).localStorage;});
}
test('selected address and CEP are available after a new field/reload with no API request',async t=>{
  mockStorage(t);storageService.setScope(null);t.after(()=>storageService.setScope(null));
  let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('offline');});
  rememberAddress(place,'Rua da Memória, 188, São Paulo');
  const result=await searchLocations('Rua da Memória, 188, São Paulo');
  assert.equal(requests,0);assert.deepEqual(result.results[0].coords,place.coords);
  assert.equal(result.results[0].addressParts?.postcode,'05555777');
  assert.equal((await searchLocations('05555-777')).results[0].addressParts?.houseNumber,'188');
  assert.equal(requests,0,'a known complete CEP is available directly from the device');
  rememberAddress(place,'Rua da Memória, 188, São Paulo');assert.equal(readAddressHistory().length,1,'repeated selections do not duplicate the address');
  await clearAddressHistory();assert.equal(readAddressHistory().length,0);
});
test('public tourist catalog is already available on the device and needs no geocoder',async t=>{
  mockStorage(t);storageService.setScope(null);
  let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('no external lookup');});
  const result=await searchLocations('Parque Ibirapuera');
  assert.equal(result.results[0].id,'sp-parque-ibirapuera');assert.equal(requests,0);
});
test('a partial query alias does not hide other addresses from the own API',async t=>{
  mockStorage(t);storageService.setScope(null);
  const alpha={id:'alpha',name:'Parada Alfa',address:'São Paulo, SP',coords:[-23.5,-46.6] as [number,number]};
  rememberAddress(alpha,'Parada');let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({results:[alpha,{...alpha,id:'beta',name:'Parada Beta',coords:[-23.6,-46.7]}]});});
  assert.equal((await searchLocations('Parada')).results.length,2);assert.equal(calls,1);
});
test('private device history cannot be read by another account or a guest',async t=>{
  mockStorage(t);t.after(()=>storageService.setScope(null));
  t.mock.method(globalThis,'fetch',async()=>Response.json({saved:true}));
  storageService.setScope('owner-a');rememberAddress(place,'Minha casa do teste');await new Promise(setImmediate);
  storageService.setScope('owner-b');assert.equal(storedAddressMatches('Minha casa do teste').results.length,0);
  storageService.setScope(null);assert.equal(readAddressHistory().length,0);
  storageService.setScope('owner-a');assert.equal(storedAddressMatches('Minha casa do teste').results.length,1);
});
test('changing the number or CEP in the picker never resolves the old query to a different property',async t=>{
  mockStorage(t);storageService.setScope(null);
  t.mock.method(globalThis,'fetch',async()=>Response.json({results:[]}));
  rememberAddress({...place,name:place.name.replace('188','190'),address:place.address.replace('188','190')},'Rua da Memória, 188, São Paulo');
  const missing=await searchLocations('Rua da Memória, 188, São Paulo');
  assert.deepEqual(missing.results,[]);assert.equal(missing.unmatchedHouseNumber,'188');
  rememberAddress(place,'05555-000');
  assert.deepEqual((await searchLocations('05555-000')).results,[]);
});
test('pending personal entries sync to the own API after connectivity returns, with an account guard',async t=>{
  mockStorage(t);storageService.setScope('owner-a');t.after(()=>storageService.setScope(null));
  const requests:{path:string;body:any}[]=[];let offline=true;
  t.mock.method(globalThis,'fetch',async(input:any,options:RequestInit)=>{
    requests.push({path:String(input),body:JSON.parse(String(options.body))});
    if(offline)throw Error('offline');return Response.json({saved:true});
  });
  rememberAddress(place,'Rua da Memória, 188, São Paulo');await new Promise(setImmediate);
  assert.equal(readAddressHistory().length,1);
  offline=false;await syncAddressHistory();assert.equal(requests.length,2);
  assert.equal(requests[1].path,'/api/me/addresses');assert.equal(requests[1].body.accountId,'owner-a');
  await syncAddressHistory();assert.equal(requests.length,2,'confirmed entries are not uploaded again');
  storageService.setScope('owner-b');await syncAddressHistory();assert.equal(requests.length,2);
});

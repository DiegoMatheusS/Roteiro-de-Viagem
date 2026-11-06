import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {publicAddressMatches} from '../server/addressIndex';
import {importPublicAddress} from '../server/addressImport';
import {parseAddressParts} from '../src/services/addressDetails';

const record={id:'public-1',name:'Museu do teste postal',street:'Rua São João',houseNumber:'188',postcode:'01234-567',
  neighborhood:'Centro',city:'São Paulo',state:'SP',country:'Brasil',coords:[-23.55,-46.63]};
async function setup(db=openDatabase(':memory:')){
  let upstream=0;
  const server=createApi({db,mapFetch:(async()=>{upstream++;throw Error('Busca externa proibida');}) as typeof fetch}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const call=async(path:string,body?:unknown,cookie='',method=body===undefined?'GET':'POST')=>{
    const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api${path}`,{
      method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
  };
  return {db,call,upstream:()=>upstream,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}};
}
test('own API searches existing tourist data, structured imported addresses and CEP without third parties',async()=>{
  const api=await setup();
  try{
    const imported=importPublicAddress(api.db,record);
    for(const query of ['r sao joao 188 sao paulo','01234567','01234-567','Museu do teste postal']){
      const found=await api.call('/addresses/search?q='+encodeURIComponent(query));
      assert.equal(found.status,200);assert.equal(found.data.externalRequests,0);assert.equal(found.data.source,'role');
      assert.ok(found.data.results.some((place:any)=>place.id===imported.id),query);
    }
    const details=await api.call('/addresses/'+imported.id);
    assert.equal(details.data.addressParts.houseNumber,'188');assert.equal(details.data.addressParts.postcode,'01234567');assert.equal(details.data.addressParts.street,'Rua São João');
    const tourist=await api.call('/addresses/search?q=Parque%20Ibirapuera');
    assert.ok(tourist.data.results.some((place:any)=>place.id==='sp-parque-ibirapuera'));
    assert.equal((await api.call('/locations/search?q=01234567')).status,200,'old APKs use the same own API');
    const missing=await api.call('/addresses/search?q=Rua%20São%20João%2C%20190%2C%20São%20Paulo');
    assert.ok(missing.data.results.every((place:any)=>place.requiresPin),'another house is only a map reference, never number 190');
    assert.deepEqual((await api.call('/addresses/search?q=Endereço%20completamente%20desconhecido')).data.results,[]);
    assert.equal((await api.call('/addresses/search?q=ab')).status,400);
    assert.equal((await api.call('/addresses/search?q=Rua&lat=91&lng=0')).status,400);
    assert.equal((await api.call('/addresses/search?q=Rua&limit=1000')).status,400);
    assert.equal(api.upstream(),0);
  }finally{await api.close();}
});
test('automatic public index follows place creation, corrected numbers, deactivation and deletion',()=>{
  const db=openDatabase(':memory:');
  try{
    db.prepare('INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at,kind) VALUES(?,?,?,?,?,?,?,?)')
      .run('park','Parque da rua do teste',-23,-46,'Rua da Cultura, 12, São Paulo, SP, 01000-000','','2026-11-06','park');
    assert.equal(publicAddressMatches(db,'Rua Cultura 12')[0].addressParts?.postcode,'01000000');
    db.prepare('UPDATE stations SET address=?,lat=? WHERE id=?').run('Rua da Cultura, 20, São Paulo, SP, 01000-000',-22.9,'park');
    assert.equal(publicAddressMatches(db,'Rua Cultura 12').length,0);
    assert.equal(publicAddressMatches(db,'Rua Cultura 20')[0].coords?.[0],-22.9);
    db.prepare('UPDATE stations SET active=0 WHERE id=?').run('park');
    assert.equal(publicAddressMatches(db,'Rua Cultura 20').length,0);
    db.prepare('UPDATE stations SET active=1 WHERE id=?').run('park');
    assert.equal(publicAddressMatches(db,'Rua Cultura 20').length,1);
    db.prepare('DELETE FROM stations WHERE id=?').run('park');assert.equal(publicAddressMatches(db,'Rua Cultura 20').length,0);
    db.exec("INSERT INTO address_search(address_search,rank) VALUES('integrity-check',1)");
  }finally{db.close();}
});
test('personal residential numbers and postal codes are private, guarded on account switches and erasable',async()=>{
  const api=await setup();
  try{
    const a=await api.call('/auth/register',{email:'address-a@test.example',displayName:'Pessoa A',password:'strong-password-123'});
    const b=await api.call('/auth/register',{email:'address-b@test.example',displayName:'Pessoa B',password:'strong-password-123'});
    const selection={name:'Rua do Imóvel Particular, 188, São Paulo',address:'Rua do Imóvel Particular, 188, São Paulo, SP, 05555-000',coords:[-23.5,-46.6],category:'manual'};
    assert.equal((await api.call('/me/addresses',{selection,query:selection.name})).status,401);
    const saved=await api.call('/me/addresses',{selection,query:selection.name,accountId:a.data.user.id},a.cookie);
    assert.equal(saved.status,201);assert.equal(saved.data.selection.addressParts.postcode,'05555000');
    assert.equal((await api.call('/me/addresses',{selection,query:selection.name,accountId:a.data.user.id},b.cookie)).status,409);
    const query='/addresses/search?q='+encodeURIComponent(selection.name);
    assert.deepEqual((await api.call(query)).data.results,[]);assert.deepEqual((await api.call(query,undefined,b.cookie)).data.results,[]);
    assert.equal((await api.call(query,undefined,a.cookie)).data.results[0].addressParts.houseNumber,'188');
    assert.equal((api.db.prepare("SELECT COUNT(*) AS n FROM address_index WHERE name LIKE '%Particular%'").get() as any).n,0);
    assert.equal((api.db.prepare('SELECT COUNT(*) AS n FROM locations').get() as any).n,0,'manual addresses do not pollute public geocoding records');
    assert.equal((await api.call('/me/addresses',{selection:{...selection,coords:[91,0]},query:selection.name},a.cookie)).status,400);
    assert.equal((await api.call('/me/addresses',{selection:{...selection,addressParts:{postcode:'123'}},query:selection.name},a.cookie)).status,400);
    const imported=importPublicAddress(api.db,record);
    const canonical=await api.call('/me/addresses',{selection:{...imported,coords:[0,0]},query:imported.name},a.cookie);
    assert.deepEqual(canonical.data.selection.coords,record.coords,'client cannot move a public address');
    const insert=api.db.prepare('INSERT INTO user_address_history VALUES(?,?,?,?,?,?)');
    for(let i=0;i<1001;i++)insert.run(a.data.user.id,`other-${i}`,JSON.stringify({name:`Outro endereço ${i}`,coords:[0,0],category:'manual'}),'outro','outro endereço',`2099-01-01T00:00:${String(i%60).padStart(2,'0')}Z`);
    assert.equal((await api.call(query,undefined,a.cookie)).data.results[0].addressParts.houseNumber,'188','older addresses remain searchable after a thousand newer entries');
    assert.equal((await api.call('/addresses/'+saved.data.id,undefined,b.cookie)).status,404);
    assert.equal((await api.call('/me/addresses',undefined,a.cookie,'DELETE')).status,200);
    assert.deepEqual((await api.call('/me/addresses',undefined,a.cookie)).data.results,[]);
    assert.equal(api.upstream(),0);
  }finally{await api.close();}
});
test('the public address index survives reopening, preserves legacy places, and imports idempotently',()=>{
  const folder=mkdtempSync(join(tmpdir(),'role-address-db-')),file=join(folder,'addresses.sqlite');
  try{
    let db=openDatabase(file);const first=importPublicAddress(db,record);importPublicAddress(db,record);
    const count=(db.prepare('SELECT COUNT(*) AS n FROM address_index').get() as any).n;
    db.close();
    const plain=new DatabaseSync(file);
    plain.prepare('INSERT INTO locations VALUES(?,?,?,?,?,?,?,?)').run('legacy','Endereço da conexão antiga','Av. da Independência, 88, São Paulo, SP, 01010-000',-23,-46,'','address','2026-11-06');
    plain.close();db=openDatabase(file);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM address_index').get() as any).n,count+1);
    assert.equal(publicAddressMatches(db,'avenida independencia 88')[0].addressParts?.houseNumber,'88');
    assert.equal(publicAddressMatches(db,'01234567')[0].id,first.id);
    assert.throws(()=>importPublicAddress(db,{...record,coords:[200,0]}),/Coordenadas/);
    assert.throws(()=>importPublicAddress(db,{...record,postcode:'123'}),/CEP/);
    db.exec("INSERT INTO address_search(address_search,rank) VALUES('integrity-check',1)");db.close();
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('address components do not turn street dates, apartment numbers or CEP into a different house',()=>{
  assert.deepEqual(parseAddressParts('Rua 25 de Março, 100A, Centro, São Paulo, SP, 01021-000, Brasil'),{
    street:'Rua 25 de Março',houseNumber:'100a',postcode:'01021000',neighborhood:'Centro',city:'São Paulo',state:'SP',country:'Brasil'});
  assert.equal(parseAddressParts('Rua 25 de Março, São Paulo').houseNumber,undefined);
  assert.equal(parseAddressParts('Localização OSM: -23.5').street,undefined);
});
test('legacy invalid coordinates do not crash migration or become searchable addresses',()=>{
  const folder=mkdtempSync(join(tmpdir(),'role-address-legacy-')),file=join(folder,'legacy.sqlite');
  try{
    const old=new DatabaseSync(file);
    old.exec('CREATE TABLE locations (id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,source_url TEXT NOT NULL,category TEXT NOT NULL,updated_at TEXT NOT NULL)');
    old.prepare('INSERT INTO locations VALUES(?,?,?,?,?,?,?,?)').run('invalid','Local legado inválido','Rua do teste inválido',999,0,'','address','2026-01-01');
    old.prepare('INSERT INTO locations VALUES(?,?,?,?,?,?,?,?)').run('valid','Local legado válido','Rua do teste válido, 188, São Paulo, SP',-23,-46,'','address','2026-01-01');
    old.close();const db=openDatabase(file);
    try{assert.equal(publicAddressMatches(db,'legado invalido').length,0);assert.equal(publicAddressMatches(db,'legado valido')[0].id,'valid');
      assert.equal((db.prepare('SELECT COUNT(*) AS n FROM locations').get() as any).n,2,'original records are preserved');
    }finally{db.close();}
  }finally{rmSync(folder,{recursive:true,force:true});}
});

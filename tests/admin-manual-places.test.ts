import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/app';
import { openDatabase } from '../server/db';

test('admin cadastra e edita locais variados e pedagios; viajante consulta dados publicados', async () => {
  const oldEnv = { NODE_ENV: process.env.NODE_ENV, PUBLIC_ADMIN_URL: process.env.PUBLIC_ADMIN_URL };
  process.env.NODE_ENV = 'production';
  process.env.PUBLIC_ADMIN_URL = 'https://roteirodeviagem.pages.dev';
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rdv-manual-places-'));
  const db = openDatabase(':memory:');
  const api = createApi({ db, photoDirectory: folder });
  const server = api.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (route: string, opts: {method?:string;body?:unknown;cookie?:string}={}) =>
    fetch(base+route,{method:opts.method||'GET',headers:{
      Origin:'https://roteirodeviagem.pages.dev',
      ...(opts.cookie?{Cookie:opts.cookie}:{}),
      ...(opts.body?{'Content-Type':'application/json'}:{})
    },body:opts.body?JSON.stringify(opts.body):undefined});
  try {
    const reg = await request('/auth/register',{method:'POST',body:{email:'admin-places@example.invalid',displayName:'Admin',password:'Password-for-places-test'}});
    assert.equal(reg.status,201,await reg.clone().text());
    const ordinaryCookie=reg.headers.get('set-cookie')!.split(';')[0];
    const basePlace={name:'Mercado na Estrada',kind:'market',lat:-23.5505,lng:-46.6333,address:'Rua de teste, 10'};
    assert.equal((await request('/admin/places/manual',{method:'POST',cookie:ordinaryCookie,body:basePlace})).status,403);
    db.prepare("UPDATE users SET role='admin' WHERE email=?").run('admin-places@example.invalid');
    const login=await request('/auth/login',{method:'POST',body:{email:'admin-places@example.invalid',password:'Password-for-places-test'}});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const invalid=await request('/admin/places/manual',{method:'POST',cookie,body:{...basePlace,kind:'invalid'}});
    assert.equal(invalid.status,400);
    const emptyCoordinates=await request('/admin/places/manual',{method:'POST',cookie,body:{...basePlace,lat:'',lng:''}});
    assert.equal(emptyCoordinates.status,400);
    const created=await request('/admin/places/manual',{method:'POST',cookie,body:basePlace});
    assert.equal(created.status,201,await created.clone().text());
    const place=await created.json() as any;
    assert.equal(place.kind,'market');assert.equal(place.name,basePlace.name);assert.ok(place.id.startsWith('manual:'));
    const duplicate=await request('/admin/places/manual',{method:'POST',cookie,body:basePlace});
    assert.equal(duplicate.status,409);
    const edited=await request(`/admin/places/${encodeURIComponent(place.id)}`,{method:'PATCH',cookie,body:{name:'Mercado Atualizado',kind:'shopping',address:'Rua de teste, 10',description:'Centro de compras',website:'',phone:'',openingHours:'',active:true,hoursVerified:false}});
    assert.equal(edited.status,200,await edited.clone().text());
    assert.equal((await edited.json()).kind,'shopping');
    const publicPlace=await request(`/places/${encodeURIComponent(place.id)}`);
    assert.equal(publicPlace.status,200);
    assert.equal((await publicPlace.json()).name,'Mercado Atualizado');
    const publicSearch=await request('/locations/search?q=Mercado%20Atualizado');
    assert.equal(publicSearch.status,200);
    assert.ok((await publicSearch.json() as any).results.some((p:any)=>p.name==='Mercado Atualizado'));

    const toll=await request('/admin/toll-places',{method:'POST',cookie,body:{name:'Pedágio Rodovia de Teste',lat:-23.551,lng:-46.634}});
    assert.equal(toll.status,201,await toll.clone().text());
    const plaza=await toll.json() as any;
    assert.ok(plaza.id.startsWith('manual:'));
    const duplicateToll=await request('/admin/toll-places',{method:'POST',cookie,body:{name:'Pedágio Rodovia de Teste',lat:-23.551,lng:-46.634}});
    assert.equal(duplicateToll.status,409);
    const invalidTariff=await request(`/admin/toll-places/${encodeURIComponent(plaza.id)}/tariffs`,{method:'POST',cookie,body:{price:-3,vehicleType:'car',observedAt:new Date().toISOString()}});
    assert.equal(invalidTariff.status,400);
    const tariff=await request(`/admin/toll-places/${encodeURIComponent(plaza.id)}/tariffs`,{method:'POST',cookie,body:{price:'8.50',vehicleType:'car',observedAt:new Date().toISOString()}});
    assert.equal(tariff.status,201,await tariff.clone().text());
    assert.equal((await tariff.json()).status,'approved');
    const stored=db.prepare("SELECT status,price FROM toll_entries WHERE toll_id=? AND vehicle_type='car'").get(plaza.id) as any;
    assert.equal(stored.status,'approved');assert.equal(stored.price,8.5);
    const lookup=await request('/admin/toll-places', {cookie});
    assert.equal(lookup.status,200);assert.ok((await lookup.json() as any).items.some((i:any)=>i.id===plaza.id&&i.activeTariffs===1));
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    db.close();fs.rmSync(folder,{recursive:true,force:true});
    for(const [key,value] of Object.entries(oldEnv))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

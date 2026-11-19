import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

execFileSync(process.execPath,['scripts/build-cloudflare.mjs'],{stdio:'inherit'});
const folder=mkdtempSync(join(tmpdir(),'ruavo-worker-smoke-'));
const publicOrigin='https://ruavo-test.example';
const options={
  modules:true,scriptPath:'cloudflare-dist/worker.js',compatibilityDate:'2026-11-19',compatibilityFlags:['nodejs_compat'],
  cf:false,host:'127.0.0.1',port:0,
  durableObjects:{RUAVO_DATABASE:{className:'RuavoDatabase',useSQLite:true}},
  resourcePersistencePath:folder,r2Buckets:['RADAR_SOURCES'],
  images:{binding:'IMAGES'},
  bindings:{NODE_ENV:'production',PUBLIC_APP_URL:publicOrigin,PARDAL_ENABLED:'0',
    WEB_PROXY_SECRET:'fixture-only-cloudflare-worker-secret-123456789',TOMTOM_TRAFFIC_API_KEY:'fixture-not-a-real-key'},
};
let runtime;
const start=async()=>{
  runtime=new Miniflare(convertV4MiniflareOptions(options));
  await runtime.ready;
};
const request=async(path,body,cookie='',origin=publicOrigin)=>{
  const response=await runtime.dispatchFetch('https://api.ruavo-test.example'+path,{
    method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  return response;
};
try{
  await start();
  let response=await request('/api/health');
  assert.equal(response.status,200,await response.text());
  assert.equal((await request('/api/auth/register',{},'','https://untrusted.example')).status,403);
  response=await request('/api/auth/register',{email:'worker@example.invalid',displayName:'Teste Worker',password:'fixture-password-123'});
  assert.equal(response.status,201,await response.clone().text());
  const account=await response.json(),session=response.headers.get('Set-Cookie');
  assert.match(session,/Secure/i);assert.match(session,/HttpOnly/i);assert.match(session,/SameSite=Strict/i);
  const cookie=session.split(';')[0];
  assert.equal(account.user?.role??account.role,'user');
  response=await request('/api/traffic/status');
  const traffic=await response.json();
  assert.equal(traffic.available,true);
  assert.match(traffic.tileUrl,/^https:\/\/api\.ruavo-test\.example\/api\/traffic\/tiles\//,
    'o Android recebe URLs absolutas do backend Cloudflare, sem retornar ao Railway');
  assert.equal((await request('/api/admin/summary',undefined,cookie)).status,403);
  await runtime.dispose();runtime=null;
  await start();
  response=await request('/api/auth/me',undefined,cookie);
  assert.equal((await response.json()).user.displayName,'Teste Worker','a conta e a sessão sobrevivem ao reinício');
  assert.equal((await request('/api/auth/logout',{},cookie)).status,200);
  assert.equal((await (await request('/api/auth/me',undefined,cookie)).json()).user,null);
  console.log('PASS: Cloudflare real runtime, SQLite persistence, registration/session, CSRF, admin roles and absolute traffic URLs.');
}finally{
  if(runtime)await runtime.dispose();
  rmSync(folder,{recursive:true,force:true});
}

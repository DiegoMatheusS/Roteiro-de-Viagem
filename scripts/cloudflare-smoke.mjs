import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as WorkerResponse} from 'miniflare';
import {PNG} from 'pngjs';

execFileSync(process.execPath,['scripts/build-cloudflare.mjs'],{stdio:'inherit'});
const folder=mkdtempSync(join(tmpdir(),'ruavo-worker-smoke-'));
const publicOrigin='https://ruavo-test.example';
const providerTile=new PNG({width:256,height:256});
providerTile.data.set([215,30,37,255,42,174,65,255]);
const providerPng=PNG.sync.write(providerTile);
const trafficRequests=[];
const options={
  modules:true,scriptPath:'cloudflare-dist/worker.js',compatibilityDate:'2026-11-19',compatibilityFlags:['nodejs_compat'],
  cf:false,host:'127.0.0.1',port:0,
  durableObjects:{RUAVO_DATABASE:{className:'RuavoDatabase',useSQLite:true}},
  resourcePersistencePath:folder,r2Buckets:['RADAR_SOURCES'],
  images:{binding:'IMAGES'},
  bindings:{NODE_ENV:'production',PUBLIC_APP_URL:publicOrigin,PARDAL_ENABLED:'0',
    WEB_PROXY_SECRET:'fixture-only-cloudflare-worker-secret-123456789',TOMTOM_TRAFFIC_API_KEY:'fixture-not-a-real-key'},
  outboundService(request){
    const url=new URL(request.url);
    if(url.hostname==='overpass-api.de') return WorkerResponse.json({elements:[
      {lat:-23.55,lon:-46.62,tags:{amenity:'police',name:'Delegacia de teste'}}
    ]});
    if(url.hostname==='router.project-osrm.org') return WorkerResponse.json({code:'Ok',routes:[{
      distance:1500,legs:[{distance:1500,duration:360}],
      geometry:{coordinates:[[-46.63,-23.55],[-46.62,-23.55]]}
    }]});
    trafficRequests.push(url.origin);
    assert.equal(url.origin,'https://api.tomtom.com');
    assert.equal(request.headers.get('TomTom-Api-Key'),'fixture-not-a-real-key');
    if(url.pathname.endsWith('/13/3035/4647')){
      return new WorkerResponse(null,{status:302,headers:{Location:'https://not-tomtom.example/tile'}});
    }
    return new WorkerResponse(providerPng,{headers:{'Content-Type':'image/png'}});
  },
};
let runtime;
const start=async(extraBindings={})=>{
  runtime=new Miniflare(convertV4MiniflareOptions({...options,bindings:{...options.bindings,...extraBindings}}));
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
  response=await request('/api/sos/police-route',{originCoords:[-23.55,-46.63]});
  assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(await response.json(),{
    station:{name:'Delegacia de teste',coords:[-23.55,-46.62]},
    routePath:[[-23.55,-46.63],[-23.55,-46.62]],distanceKm:1.5
  });
  response=await request('/api/android/update?channel=debug');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{update:null});
  assert.equal((await request('/api/android/update?channel=invalid')).status,400);
  assert.equal((await request('/api/android/update?channel=debug',{})).status,405);
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
  response=await request('/api/traffic/tiles/red/13/3034/4647.png');
  assert.equal(response.status,200,'o Worker busca o trânsito na TomTom e entrega o PNG');
  assert.match(response.headers.get('Content-Type'),/^image\/png/);
  const renderedTile=PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(Array.from(renderedTile.data.subarray(0,4)),[232,33,48,255]);
  assert.equal(renderedTile.data[7],0);
  assert.equal((await request('/api/traffic/tiles/light/13/3035/4647.png')).status,503);
  assert.deepEqual(trafficRequests,['https://api.tomtom.com','https://api.tomtom.com'],
    'redirecionamentos da TomTom nunca levam a chave para outro domínio');
  assert.equal((await request('/api/admin/summary',undefined,cookie)).status,403);
  await runtime.dispose();runtime=null;
  const debugUpdate={minVersionCode:853,downloadUrl:'https://ruavo-test.example/RUAVO-teste.apk'};
  const releaseUpdate={minVersionCode:54,downloadUrl:'https://play.google.com/store/apps/details?id=br.com.roteirodeviagem.app'};
  await start({RUAVO_ANDROID_UPDATES:JSON.stringify({debug:debugUpdate,release:releaseUpdate})});
  assert.deepEqual(await (await request('/api/android/update?channel=debug')).json(),{update:debugUpdate});
  assert.deepEqual(await (await request('/api/android/update?channel=release')).json(),{update:releaseUpdate});
  response=await request('/api/auth/me',undefined,cookie);
  assert.equal((await response.json()).user.displayName,'Teste Worker','a conta e a sessão sobrevivem ao reinício');
  assert.equal((await request('/api/auth/logout',{},cookie)).status,200);
  assert.equal((await (await request('/api/auth/me',undefined,cookie)).json()).user,null);
  await runtime.dispose();runtime=null;
  await start({RDV_BOOTSTRAP_ADMIN_EMAIL:'fixture-admin@example.invalid',RUAVO_ANDROID_UPDATES:JSON.stringify({
    debug:debugUpdate,release:{...releaseUpdate,downloadUrl:'http://ruavo-test.example/RUAVO.apk'}
  })});
  response=await request('/api/health');
  assert.equal(response.status,503);
  assert.equal(response.headers.get('X-Ruavo-Health-Error'),'database-admin');
  assert.equal(response.headers.get('X-Ruavo-Health-Cause'),'admin-config');
  assert.deepEqual(await (await request('/api/android/update?channel=debug')).json(),{update:debugUpdate},
    'a consulta de atualização funciona durante uma falha do banco');
  assert.equal((await request('/api/android/update?channel=release')).status,503);
  console.log('PASS: Cloudflare runtime, SQLite persistence, registration/session, CSRF, admin roles, SOS route and traffic PNG delivery.');
}finally{
  if(runtime)await runtime.dispose();
  rmSync(folder,{recursive:true,force:true});
}

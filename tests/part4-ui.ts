import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import { chromium, type BrowserContext } from 'playwright';
import { createServer } from 'vite';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { emptyTravelerSnapshot } from '../src/services/storageService';
import { createRoadDraft } from '../src/services/touristCircuit';
import type { Vehicle } from '../src/types';
const vehicle:Vehicle={id:'test-bike',type:'motorcycle',brand:'Teste',model:'Moto do teste',nickname:'Moto',year:2026,fuelType:'gasolina',tankCapacityLiters:17,maxPassengers:2,odometerKm:0,consumption:{referenceUrban:20,referenceHighway:25,referenceAverage:22,userConfigured:22,source:'teste',sourceDate:'2026'}};
const path:[number,number][]=[[0,0],[0,0.01],[0.01,0.01]];
const trip={...createRoadDraft({originName:'Origem de teste',originCoords:path[0],destinationName:'Destino de teste',destinationCoords:path[2],vehicle,circular:false,limits:{mode:'destination'}}),routePath:path,routingSource:'OSRM' as const,distanceKm:2.2,durationMinutes:15,drivingMinutes:15};
const db=openDatabase(':memory:');
const server=createApi({db,mapFetch:async()=>new Response('{"elements":[]}'),weatherFetch:async()=>new Response('{}',{status:503})}).listen(3001,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const mapTile=await sharp({create:{width:256,height:256,channels:3,background:'#eaf0ef'}}).png().toBuffer();
const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:0,longitude:0.002,accuracy:3}})));
const [owner,second,rider]=await Promise.all(contexts.map(c=>c.newPage()));const errors:string[]=[];
const testGps=contexts.map(()=>({latitude:0,longitude:0.002,accuracy:3}));
let gpsRefreshTimer:ReturnType<typeof setInterval>|undefined;
// Chromium's simulated GPS does not necessarily emit another reading while stationary.
// Keep the test fixture reporting fresh timestamps, as a real running GPS does.
const refreshTestGps=async()=>Promise.all(contexts.map((context,index)=>context.setGeolocation(testGps[index])));
const moveTestGps=async(index:number,coords:{latitude:number;longitude:number;accuracy:number})=>{
 testGps[index]=coords;
 await contexts[index].setGeolocation(coords);
};
for(const page of [owner,second,rider]){
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https:\/\//,route=>route.request().resourceType()==='image'?route.fulfill({contentType:'image/png',body:mapTile}):route.abort());
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
}
const register=async(email:string,name:string)=>{const response=await fetch('http://127.0.0.1:3001/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,displayName:name,password:'test-password-long'})});assert.equal(response.status,201);return {user:(await response.json() as any).user,cookie:response.headers.get('set-cookie')!.split(';')[0]};};
const login=async(context:BrowserContext,cookie:string)=>{const index=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,index),value:cookie.slice(index+1),domain:'127.0.0.1',path:'/api',httpOnly:true,sameSite:'Lax'}]);};
const save=async(account:any)=>{const state={...emptyTravelerSnapshot(account.user.id,account.user.displayName),vehicles:[vehicle],trips:[trip],selectedVehicleId:vehicle.id};const response=await fetch('http://127.0.0.1:3001/api/me/state',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:account.cookie},body:JSON.stringify({state,revision:0})});assert.equal(response.status,200);};
fs.mkdirSync('test-results',{recursive:true});
try{
 const organizer=await register('convoy-ui-owner@test.example','Organizador'),participant=await register('convoy-ui-rider@test.example','Motociclista');await save(organizer);await save(participant);
 await login(contexts[0],organizer.cookie);await login(contexts[1],organizer.cookie);await login(contexts[2],participant.cookie);
 for(const page of [owner,second,rider]){await page.goto('http://127.0.0.1:3000');await page.getByRole('button',{name:'Aba Perfil'}).click();}
 // Separate fields edited before either delayed save. Neither device may overwrite the other.
 await owner.getByRole('button',{name:'Editar',exact:true}).click();await owner.getByLabel('Sobre você',{exact:true}).fill('Bio sincronizada');await owner.getByRole('button',{name:'Salvar perfil',exact:true}).click();
 await second.getByRole('button',{name:/Segurança e SOS/}).click();await second.getByPlaceholder('Informe seu endereço para retorno de emergência').fill('Casa sincronizada');
 await owner.waitForFunction(async()=>{const result=await (await fetch('/api/me/state')).json();return result.state?.profile.bio==='Bio sincronizada'&&result.state?.profile.homeAddress==='Casa sincronizada';});
 await owner.evaluate(()=>window.dispatchEvent(new Event('online')));await owner.getByRole('button',{name:'Segurança & SOS',exact:true}).click();await owner.getByPlaceholder('Informe seu endereço para retorno de emergência').waitFor();
 await owner.waitForFunction(()=>[...document.querySelectorAll('input')].some(i=>i.value==='Casa sincronizada'));
 // Cache survives an API outage even across a reload, then synchronizes the offline edit.
 await second.route('**/api/**',route=>route.abort());await second.reload();await second.getByText(/Sem conexão. Alterações ficam neste aparelho/).waitFor();
 await second.getByRole('button',{name:'Aba Perfil'}).click();await second.getByRole('button',{name:'Editar',exact:true}).click();await second.getByLabel('Sobre você',{exact:true}).fill('Bio feita offline');await second.getByRole('button',{name:'Salvar perfil',exact:true}).click();
 await second.unroute('**/api/**');await second.evaluate(()=>window.dispatchEvent(new Event('online')));
 await second.waitForFunction(async()=>{const r=await (await fetch('/api/me/state')).json();return r.state?.profile.bio==='Bio feita offline'&&r.state?.profile.homeAddress==='Casa sincronizada';});
 await owner.getByRole('button',{name:'Abrir menu'}).click();await owner.getByRole('button',{name:'Mapa',exact:true}).click();await owner.getByRole('button',{name:'Comboio',exact:true}).first().click();
 await owner.getByText(/Comboio conectado · atualizações automáticas/).waitFor();const group=db.prepare('SELECT id,code FROM convoys').get() as any;
 await rider.getByRole('button',{name:'Configurações'}).click();await rider.getByRole('button',{name:'Entrar em um comboio por código',exact:true}).click();await rider.getByRole('dialog',{name:'Entrar no comboio'}).getByLabel('Código do comboio',{exact:true}).fill(group.code);await rider.getByRole('button',{name:'Entrar',exact:true}).click();await rider.getByText(/Comboio conectado · atualizações automáticas/).waitFor();
 assert.equal(await rider.getByRole('button',{name:'Adicionar Ponto',exact:true}).count(),0);assert.equal(await rider.getByRole('button',{name:'Encerrar este Comboio de Viagem',exact:true}).count(),0);
 // The app now marks readings older than 6 s as stale; an idle mock must keep its fix fresh.
 await refreshTestGps();
 gpsRefreshTimer=setInterval(()=>{void refreshTestGps().catch(error=>errors.push('GPS fixture: '+String(error)));},2000);
 await owner.getByRole('button',{name:'Compartilhar Localização',exact:true}).click();await rider.getByRole('button',{name:'Compartilhar Localização',exact:true}).click();
 await owner.getByRole('button',{name:'Localização ativa',exact:true}).waitFor();await rider.getByRole('button',{name:'Localização ativa',exact:true}).waitFor();
 await owner.waitForFunction(()=>document.querySelectorAll('.convoy-participant-marker').length===2);
 // A parked phone can stop emitting GPS fixes: the 6 s stale warning must not
 // revoke location consent or kill the watch. Fresh fixes must restore readiness.
 if(gpsRefreshTimer)clearInterval(gpsRefreshTimer);
 gpsRefreshTimer=undefined;
 await owner.getByRole('button',{name:'Buscando GPS...',exact:true}).waitFor({timeout:18000});
 assert.equal(await owner.getByRole('button',{name:'Compartilhar Localização',exact:true}).count(),0,
   'A stale GPS reading must not revoke consent to share in the convoy');
 await refreshTestGps();
 gpsRefreshTimer=setInterval(()=>{void refreshTestGps().catch(error=>errors.push('GPS fixture: '+String(error)));},2000);
 await owner.getByRole('button',{name:'Localização ativa',exact:true}).waitFor();
 // O mapa nao exibe mais +/-. Testa o zoom por gesto (duplo clique) sem mudar a preferencia do usuario.
 assert.equal(await owner.locator('.leaflet-control-zoom-in, .leaflet-control-zoom-out').count(),0);
 await owner.locator('[data-map-engine="maplibre-standalone"], .leaflet-container').last().dblclick({position:{x:110,y:150}});
 await owner.waitForFunction(()=>{const maps=document.querySelectorAll<HTMLElement>('[data-map-engine="maplibre-standalone"], .leaflet-container');const map=maps.item(maps.length-1);return map?.dataset.mapEngine==='maplibre-standalone'?map.dataset.mapIdle==='true':!document.querySelector('.leaflet-zoom-anim');});
 // Marker CSS transforms change with any map pan; only the map zoom is stable.
 const zoomBefore=await owner.evaluate(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapZoom??null);
 const before=await owner.locator('.convoy-participant-marker[title="Motociclista"]').getAttribute('style');
 await rider.getByRole('button',{name:'Voltar ao menu e manter comboio ativo',exact:true}).click();await rider.getByRole('button',{name:'Aba Perfil'}).click();await rider.getByRole('button',{name:'Abrir comboio',exact:true}).waitFor();
 await moveTestGps(2,{latitude:0.005,longitude:0.01,accuracy:3});
 await owner.waitForFunction(async id=>{const r=await (await fetch('/api/convoys/'+id)).json();return r.participants.some((p:any)=>p.name==='Motociclista'&&p.coords?.[0]===0.005);},group.id);
 await owner.waitForFunction(previous=>document.querySelector('.convoy-participant-marker[title="Motociclista"]')?.getAttribute('style')!==previous,before);
 if(zoomBefore!==null){
   const zoomAfter=await owner.evaluate(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapZoom??null);
   assert.ok(zoomAfter!==null&&Math.abs(Number(zoomAfter)-Number(zoomBefore))<0.05,
     'GPS updates must preserve the chosen map zoom');
 }
 await owner.screenshot({path:'test-results/convoy-two-phones.png'});
 await rider.getByRole('button',{name:'Parar compartilhamento',exact:true}).click();await owner.waitForFunction(()=>document.querySelectorAll('.convoy-participant-marker').length===1);
 // Explicit route publication is shared while meeting-point check-ins are retained.
 await rider.getByRole('button',{name:'Configurações'}).click();await rider.getByRole('button',{name:'Entrar em um comboio por código',exact:true}).click();await rider.getByRole('dialog',{name:'Entrar no comboio'}).getByLabel('Código do comboio',{exact:true}).fill(group.code);await rider.getByRole('button',{name:'Entrar',exact:true}).click();await rider.getByRole('button',{name:'Cheguei',exact:true}).first().click();
 await owner.getByRole('button',{name:'Atualizar roteiro do comboio',exact:true}).click();await rider.getByText('1 no local',{exact:true}).last().waitFor();
 await owner.getByRole('button',{name:'Encerrar Comboio',exact:true}).click();
 const endedRequest=owner.waitForResponse(response=>response.url().endsWith(`/api/convoys/${group.id}/end`)&&response.request().method()==='POST');
 await owner.getByRole('button',{name:'Sim, Encerrar',exact:true}).click();
 assert.equal((await endedRequest).status(),200,'the organizer must actually end the convoy');
 // The screen polls every 5 s; App independently refreshes membership every
 // 15 s and exits an ended convoy. Either can win. A banner can disappear in
 // that same commit, so also accept the confirmed return to the app tabs.
 await rider.waitForFunction(()=>document.body.innerText.includes('Este comboio foi encerrado')||
   (!document.querySelector('[aria-label="Voltar ao menu e manter comboio ativo"]')&&
    !!document.querySelector('[aria-label="Aba Perfil"]')));
 const ended=await rider.evaluate(async id=>{
   const response=await fetch('/api/convoys/'+id);
   if(!response.ok)throw new Error('Cannot confirm ended convoy: '+response.status);
   return response.json();
 },group.id);
 assert.equal(ended.status,'completed');
 assert.ok(ended.participants.every((participant:any)=>!participant.coords),
   'the server must no longer expose any participant location');
 // Verify eventual map-effect cleanup in both valid UI states.
 await rider.waitForFunction(()=>document.querySelectorAll('.convoy-participant-marker').length===0);
 assert.equal(await rider.locator('.convoy-participant-marker').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: duas sessões da mesma conta, edição offline, GPS automático em duas contas, outras telas, retomada e encerramento do Comboio.');
}catch(error){for(const [index,page] of [owner,second,rider].entries())await page.screenshot({path:`test-results/part4-failure-${index}.png`,fullPage:true}).catch(()=>{});throw error;}
finally{if(gpsRefreshTimer)clearInterval(gpsRefreshTimer);await browser.close();await vite.close();await new Promise<void>(r=>server.close(()=>r()));db.close();}

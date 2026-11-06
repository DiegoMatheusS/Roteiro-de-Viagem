import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {createRoadDraft} from '../src/services/touristCircuit';
import {GUEST_NAVIGATION_VEHICLE} from '../src/services/guestNavigationVehicle';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
let releaseMain=()=>{},releaseAuth=()=>{};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const draft=createRoadDraft({originName:'Saída',originCoords:[-23.55,-46.63],destinationName:'Destino',
    destinationCoords:[-23.54,-46.62],vehicle:GUEST_NAVIGATION_VEHICLE,circular:false,limits:{mode:'destination'}});
  const trips=['A','B'].map((name,index)=>({...draft,id:`history-${name}`,title:`Passeio ${name}`,
    status:'completed',actualDistanceKm:12+index,distanceKm:12+index,createdAt:`2026-11-0${index+1}T12:00:00Z`}));
  await page.addInitScript(trips=>{
    if(localStorage.getItem('rdv_private_v2_guest_trips')===null)
      localStorage.setItem('rdv_private_v2_guest_trips',JSON.stringify(trips));
  },trips);
  await page.addInitScript(`
    window.__startupGpsWatches=0;
    Object.defineProperty(navigator,'geolocation',{value:{
      watchPosition(){window.__startupGpsWatches++;return 1;},
      clearWatch(){window.__startupGpsWatches--;}
    }});
  `);
  await page.route(/^https:\/\//,route=>route.abort());
  await page.route('**/api/**',route=>route.fulfill({json:{available:false,places:[],stations:[],items:[]}}));
  const mainReady=new Promise<void>(resolve=>{releaseMain=resolve;});
  const authReady=new Promise<void>(resolve=>{releaseAuth=resolve;});
  await page.route('**/src/main.tsx',async route=>{await mainReady;await route.continue();});
  await page.route('**/api/auth/me',async route=>{await authReady;await route.fulfill({json:{user:null}});});
  await page.goto('http://127.0.0.1:3000/',{waitUntil:'commit'});
  const opening=page.getByRole('main',{name:'Preparando o Rolê'});
  const logo=opening.getByRole('img',{name:'Rolê',exact:true});
  await logo.waitFor({state:'visible'});
  await logo.evaluate(image=>image instanceof HTMLImageElement?image.decode():undefined);
  const background=await opening.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(background,'rgb(255, 255, 255)');
  const box=(await logo.boundingBox())!;
  assert.ok(Math.abs(box.x+box.width/2-195)<2&&Math.abs(box.y+box.height/2-422)<2,'logo centralizado desde o HTML inicial');
  assert.ok(await logo.evaluate(el=>el.getAnimations().some(animation=>animation.playState==='running')),'logo pulsa antes de carregar o JavaScript');
  assert.equal(await page.locator('[data-map-engine]').count(),0);
  const authentication=page.waitForRequest('**/api/auth/me');
  releaseMain();await authentication;
  await logo.waitFor({state:'visible'});
  assert.equal(await page.locator('[data-map-engine]').count(),0,'hidratação não monta um mapa temporário');
  assert.equal(await page.evaluate(()=>(window as any).__startupGpsWatches),0,'abertura não liga o GPS');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await logo.evaluate(el=>el.getAnimations().length),0,'redução de movimento mantém logo estático');
  await page.emulateMedia({reducedMotion:'no-preference'});
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/startup-white-logo.png'});
  releaseAuth();
  await page.getByRole('button',{name:'Aba Viagens',exact:true}).click();
  const history=page.getByRole('region',{name:'Minhas viagens'});
  await history.getByRole('heading',{name:'Passeio A',exact:true}).waitFor({state:'attached'});
  await history.getByRole('heading',{name:'Passeio B',exact:true}).waitFor();
  const storedIds=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rdv_private_v2_guest_trips')||'[]').map((trip:any)=>trip.id));
  async function remove(name:string,confirm:boolean){
    const pending=page.waitForEvent('dialog');
    const click=history.getByRole('button',{name:`Excluir Passeio ${name}`,exact:true}).click();
    const dialog=await pending;
    assert.equal(dialog.type(),'confirm');assert.equal(dialog.message(),'Deseja mesmo excluir?');
    if(confirm)await dialog.accept();else await dialog.dismiss();
    await click;
  }
  await remove('B',false);
  assert.deepEqual(await storedIds(),['history-A','history-B'],'cancelar mantém os registros salvos');
  await history.getByRole('heading',{name:'Passeio B',exact:true}).waitFor();
  await remove('B',true);
  await history.getByRole('heading',{name:'Passeio B',exact:true}).waitFor({state:'detached'});
  assert.deepEqual(await storedIds(),['history-A'],'confirmar remove somente a viagem escolhida');
  await page.reload();
  await page.getByRole('button',{name:'Aba Viagens',exact:true}).click();
  await history.getByRole('heading',{name:'Passeio A',exact:true}).waitFor();
  assert.equal(await history.getByRole('heading',{name:'Passeio B',exact:true}).count(),0,'exclusão persiste após reabrir');
  assert.deepEqual(errors,[]);
  console.log('PASS: abertura branca com logo pulsando antes do JS e durante hidratação, sem mapa/GPS; cancelar exclusão preserva histórico e confirmar remove só a viagem escolhida.');
}finally{releaseMain();releaseAuth();await browser?.close();await vite.close();}

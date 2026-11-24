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
  const opening=page.getByRole('main',{name:'Preparando o RUAVO'});
  const logo=opening.getByRole('img',{name:'RUAVO',exact:true});
  await logo.waitFor({state:'visible'});
  await opening.getByText('Preparando o aplicativo…',{exact:true}).waitFor({state:'visible'});
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
  await opening.getByText('Preparando o aplicativo…',{exact:true}).waitFor({state:'visible'});
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
  const settings=async()=>{
    await page.getByRole('button',{name:'Aba Perfil',exact:true}).click();
    await page.getByRole('button',{name:/Configurações Navegação/}).click();
    return page.getByRole('group',{name:'Densidade dos ícones'});
  };
  const labels={less:'Menos',more:'Mais',moderate:'Moderado'} as const;
  const densityButton=(mode:keyof typeof labels)=>
    page.getByRole('group',{name:'Densidade dos ícones'})
      .getByRole('button',{name:new RegExp('^'+labels[mode])});
  let icons=await settings();await icons.waitFor();
  assert.equal(await densityButton('moderate').getAttribute('aria-pressed'),'true');
  for(const mode of ['less','more','moderate'] as const){
    await densityButton(mode).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('role:map-icon-density:v1')),mode);
    assert.equal(await densityButton(mode).getAttribute('aria-pressed'),'true');
  }
  await densityButton('more').click();await page.reload();icons=await settings();
  assert.equal(await densityButton('more').getAttribute('aria-pressed'),'true',
    'a preferência de ícones permanece após reabrir o aplicativo');
  await page.getByText('O Explorar continua mostrando todos os ícones disponíveis.',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
  const android=await browser.newPage({viewport:{width:390,height:844}});
  const downloadUrl='https://ruavo.example/RUAVO-teste.apk';
  await android.addInitScript(downloadUrl=>{
    const bridge=window as any;
    const calls={requests:[] as string[],links:[] as string[]};
    bridge.__androidUpdateCalls=calls;
    bridge.androidBridge={};
    bridge.Capacitor={
      PluginHeaders:[{name:'TravelNative',methods:['installedAndroidBuild','request','openAndroidUpdate','stopTracking']
        .map(name=>({name,rtype:'promise'}))}],
      async nativePromise(_plugin:string,method:string,options:{path:string;url:string}){
        if(method==='installedAndroidBuild')
          return {channel:'debug',versionCode:Number(localStorage.getItem('fixture-android-build')??'19')};
        if(method==='openAndroidUpdate'){calls.links.push(options.url);return;}
        if(method==='request'){
          calls.requests.push(options.path);
          if(options.path==='/android/update?channel=debug'){
            if(localStorage.getItem('fixture-android-offline')==='yes')throw Error('Offline');
            return {status:200,body:JSON.stringify({update:{minVersionCode:20,downloadUrl}})};
          }
          return {status:200,body:JSON.stringify({user:null,places:[],stations:[]})};
        }
      }
    };
  },downloadUrl);
  await android.route(/^https:\/\//,route=>route.abort());
  await android.goto('http://127.0.0.1:3000/');
  const required=android.getByRole('heading',{name:'Atualização obrigatória',exact:true});
  await required.waitFor();
  assert.deepEqual(await android.evaluate(()=>(window as any).__androidUpdateCalls.requests),['/android/update?channel=debug']);
  assert.equal(await android.getByRole('button',{name:'Aba Viagens',exact:true}).count(),0);
  await android.getByRole('button',{name:'Atualizar agora',exact:true}).click();
  assert.deepEqual(await android.evaluate(()=>(window as any).__androidUpdateCalls.links),[downloadUrl]);
  await android.evaluate(()=>localStorage.setItem('fixture-android-offline','yes'));
  await android.reload();
  await required.waitFor();
  await android.evaluate(()=>localStorage.setItem('fixture-android-build','20'));
  await android.reload();
  await android.getByRole('button',{name:'Aba Viagens',exact:true}).waitFor();
  assert.equal(await required.count(),0,'a versão instalada igual ao mínimo libera a navegação offline');
  await android.close();
  console.log('PASS: abertura branca com logo pulsando antes do JS e durante hidratação, sem mapa/GPS; cancelar exclusão preserva histórico e confirmar remove só a viagem escolhida.');
  console.log('PASS: atualização Android bloqueia a versão anterior, abre o download e libera o app após instalar a versão mínima.');
}finally{releaseMain();releaseAuth();await browser?.close();await vite.close();}

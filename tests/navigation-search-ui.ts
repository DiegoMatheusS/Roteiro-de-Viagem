import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
let releaseSearch:()=>void=()=>{};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const screen of ['home','map']){
  const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true,isMobile:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'geolocation',{value:{
      watchPosition(success:Function){(window as any).__searchGps=success;return 1;},
      getCurrentPosition(success:Function){success({coords:{latitude:-23.55,longitude:-46.63,accuracy:6,speed:0,heading:90},timestamp:Date.now()});},clearWatch(){}
    }});
  });
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
  await page.route('**/api/**',route=>route.fulfill({json:{stations:[],places:[],options:[]}}));
  const queries:string[]=[];
  const pendingResponse=new Promise<void>(resolve=>{releaseSearch=resolve;});
  let mode:'error'|'empty'|'success'='error';
  await page.route('**/api/locations/search?**',async route=>{
    queries.push(new URL(route.request().url()).searchParams.get('q')!);
    if(queries.length===1)await pendingResponse;
    await route.fulfill(mode==='error'?{status:503,json:{error:'Busca indisponível. Tente novamente.'}}:
      {json:{results:mode==='empty'?[]:[{id:'osm:way:1',name:'Rua de teste',address:'Cidade de teste',coords:[-23.54,-46.62]}]}});
  });
  await page.goto('http://127.0.0.1:3000/tests/fixtures/navigation-home-search.html?screen='+screen);
  await page.waitForFunction(()=>typeof (window as any).__searchGps==='function');
  await page.evaluate(()=>(window as any).__searchGps({coords:{latitude:-23.55,longitude:-46.63,accuracy:6,speed:0,heading:90},timestamp:Date.now()}));
  const marker=page.locator('.user-live-marker');
  await marker.waitFor().catch(async error=>{
    console.error(screen,errors,await page.evaluate(()=>({text:document.body.innerText,
      map:document.querySelector<HTMLElement>('[data-map-engine]')?.dataset,
      marker:document.querySelector('.user-live-marker')?.outerHTML})));
    throw error;
  });
  await marker.evaluate(element=>(window as any).__searchArrow=element);
  await page.evaluate(()=>(window as any).__searchGps({coords:{latitude:-23.55,longitude:-46.63,accuracy:6,speed:0,heading:90},timestamp:Date.now()-6_001}));
  await page.waitForFunction(()=>document.querySelector('.user-live-marker')?.getAttribute('data-gps-state')==='stale');
  assert.equal(await marker.evaluate(element=>element===(window as any).__searchArrow),true,`${screen}: signal loss must keep the same arrow`);
  await page.evaluate(()=>(window as any).__searchGps({coords:{latitude:-23.55,longitude:-46.63,accuracy:6,speed:0,heading:90},timestamp:Date.now()}));
  await page.waitForFunction(()=>document.querySelector('.user-live-marker')?.getAttribute('data-gps-state')==='live');
  const input=page.getByRole('searchbox',{name:'Para onde quer ir?'});
  const submit=page.getByRole('button',{name:'Pesquisar destino',exact:true});
  await input.fill('Rua de teste');
  await submit.tap();
  const progress=page.getByRole('status').filter({hasText:'Pesquisando endereço...'});
  await progress.waitFor();await page.waitForTimeout(350);
  assert.equal(await progress.evaluate(element=>{
    const r=element.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!top&&(top===element||element.contains(top));
  }),true,`${screen}: search progress must stay visible above the map`);
  releaseSearch();
  const alert=page.getByRole('alert').filter({hasText:'Busca indisponível'});
  await alert.waitFor();
  assert.equal(await alert.evaluate(element=>{
    const r=element.getBoundingClientRect();
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!top&&(top===element||element.contains(top));
  }),true,'search failures must appear above the full-screen map, inside the viewport');
  mode='empty';
  await input.press('Enter');
  await page.getByRole('alert').filter({hasText:'Nenhum destino encontrado'}).waitFor();
  mode='success';
  await submit.tap();
  await page.getByRole('region',{name:'Destino no mapa'}).getByRole('heading',{name:'Rua de teste'}).waitFor();
  assert.deepEqual(queries,['Rua de teste','Rua de teste','Rua de teste'],'one request per tap or keyboard submit');
  assert.equal(await input.evaluate(element=>document.activeElement===element),false,'close the keyboard after locating the address');
  await page.getByRole('button',{name:'Sair da visualização do destino'}).click();
  await input.fill('Outra rua próxima');
  const results=page.getByRole('group',{name:'Sugestões de endereços'});
  const choice=results.getByRole('button',{name:'Escolher destino Rua de teste'});
  await choice.waitFor();
  assert.match(await results.innerText(),/km em linha reta/,
    `${screen}: suggestions must distinguish geodesic distance from driving kilometres`);
  assert.equal(await choice.evaluate(element=>{
    const box=element.getBoundingClientRect(),top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return !!top&&(top===element||element.contains(top));
  }),true,`${screen}: suggestions must remain clickable above map controls`);
  const requestsAfterTyping=queries.length;
  for(let update=0;update<3;update++)await page.evaluate(()=>(window as any).__searchGps({coords:{latitude:-23.55,longitude:-46.63,accuracy:6,speed:0,heading:90},timestamp:Date.now()}));
  await page.waitForTimeout(650);
  assert.equal(queries.length,requestsAfterTyping,`${screen}: GPS ticks must not repeat a text query`);
  await choice.tap();
  await page.getByRole('region',{name:'Destino no mapa'}).getByRole('heading',{name:'Rua de teste'}).waitFor();
  assert.equal(queries.length,requestsAfterTyping,`${screen}: choosing a suggestion must not search it again`);
  assert.equal(await input.evaluate(element=>document.activeElement===element),false);
  await page.getByRole('button',{name:'Sair da visualização do destino'}).click();
  await input.fill('Texto a cancelar');
  await input.fill('ab');
  await page.waitForTimeout(650);
  assert.equal(queries.length,requestsAfterTyping,`${screen}: short text cancels the pending suggestion request`);
  assert.equal(await results.count(),0);
  assert.deepEqual(errors,[]);
  await page.close();
  }
  console.log('PASS: Home/Map search, visible failures, live suggestions with distance, selection and cancellation without repeated GPS queries.');
}finally{releaseSearch();await browser?.close();await vite.close();}

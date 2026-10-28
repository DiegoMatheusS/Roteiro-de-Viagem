import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:420,height:850}}),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  // A fixture PNG verifies rendering only. No simulated data is bundled in the app.
  const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M20 0V256" stroke="#2ae57b" stroke-width="5"/><path d="M80 0V256" stroke="#ffc105" stroke-width="5"/><path d="M140 0V256" stroke="#fb2d09" stroke-width="5"/></svg>')).png().toBuffer();
  let statusCalls=0,tileCalls=0,fail=false;
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}
  ]}}));
  await page.route('**/api/traffic/status',route=>{statusCalls++;return route.fulfill({json:{available:true,provider:'TomTom',refreshSeconds:60,
    tileUrl:'http://127.0.0.1:3000/api/traffic/tiles/{style}/{z}/{x}/{y}.png',attribution:'© TomTom'}});});
  await page.route('**/api/traffic/tiles/**',route=>{tileCalls++;return fail?route.fulfill({status:503,json:{error:'Unavailable'}}):
    route.fulfill({contentType:'image/png',body:image,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});});
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-map.html');
  const map=page.locator('[data-map-engine="maplibre-standalone"]');
  const showTraffic=()=>page.getByRole('button',{name:'Mostrar trânsito',exact:true});
  const hideTraffic=()=>page.getByRole('button',{name:'Ocultar trânsito',exact:true});
  await map.locator('[data-traffic-state="off"]').waitFor();
  assert.equal(statusCalls,0,'no automatic paid traffic call on map startup');
  // Navigation zoom can begin at city scale; get close enough for the 10-km window.
  await map.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  for(let i=0;i<5;i++){
    const zoom=Number(await map.getAttribute('data-map-zoom'));
    if(zoom>=15)break;
    const canvas=await map.locator('.maplibregl-canvas').boundingBox();
    if(canvas){await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.wheel(0,-450);await page.waitForTimeout(230);}
  }
  await showTraffic().click();
  await map.locator('[data-traffic-state="live"]').waitFor({timeout:20000});
  await page.getByLabel('Legenda do trânsito').waitFor();
  // MapLibre can signal source metadata before raster-tile network requests.
  for(let retry=0;retry<30&&tileCalls===0;retry++)await page.waitForTimeout(200);
  assert.ok(tileCalls>0,'a visible traffic layer must request at least one real tile');
  assert.equal(statusCalls,1);
  for(let i=0;i<4;i++)await page.getByRole('button',{name:'Mudar direção GPS',exact:true}).click();
  assert.equal(statusCalls,1,'GPS callbacks cannot repeat traffic metadata requests');
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/traffic-map.png'});
  await hideTraffic().click();await map.locator('[data-traffic-state="off"]').waitFor();
  assert.equal(await page.getByLabel('Legenda do trânsito').count(),0);
  await page.waitForTimeout(200);const stoppedTiles=tileCalls;
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();await page.waitForTimeout(250);
  assert.equal(tileCalls,stoppedTiles,'disabled traffic cannot request more tiles after camera updates');
  await showTraffic().click();await map.locator('[data-traffic-state="live"]').waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await map.locator('[data-traffic-state="paused"]').waitFor();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await map.locator('[data-traffic-state="live"]').waitFor();
  // Traffic failures must never trip the base-map fallback or lose the GPS pin.
  await hideTraffic().click();fail=true;await showTraffic().click();
  await map.locator('[data-traffic-state="unavailable"]').waitFor();
  assert.equal(await map.getAttribute('data-map-ready'),'true');assert.equal(await map.locator('.user-live-marker').count(),1);
  assert.equal(await page.locator('[data-map-engine="leaflet-fallback"]').count(),0);
  fail=false;
  await map.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  const fallback=page.locator('[data-map-engine="leaflet-fallback"]');await fallback.waitFor();
  await fallback.locator('[data-traffic-state="off"]').waitFor({timeout:20000});
  await showTraffic().click();
  await fallback.locator('[data-traffic-state="live"]').waitFor({timeout:20000});
  assert.ok(statusCalls>=2&&statusCalls<=4,'switching engines consults status without multiplying repeated requests');
  assert.ok(await fallback.locator('.leaflet-role-traffic-pane img').count()>0);
  await page.getByRole('button',{name:'Remover mapa',exact:true}).click();
  assert.equal(await page.locator('[data-traffic-control]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: real raster traffic renders in both engines; toggling/background/failure preserve GPS and base-map gestures.');
}finally{await browser?.close();await vite.close();}

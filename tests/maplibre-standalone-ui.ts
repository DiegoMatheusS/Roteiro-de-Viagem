import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath,args:[
    '--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:420,height:850}});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}
  ]}}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-map.html');
  const map=page.locator('[data-map-engine="maplibre-standalone"]');
  await page.waitForFunction(()=>{
    const map=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    return map?.dataset.mapReady==='true' && Number(map.dataset.mapZoom)===16;
  });
  assert.equal(await page.locator('.leaflet-container').count(),0,'native navigation must not create a Leaflet viewport');
  assert.equal(await page.locator('.maplibregl-canvas').count(),1,'there is exactly one native canvas');
  const marker=page.locator('.user-live-marker');await marker.waitFor();
  const box=await map.boundingBox();assert.ok(box);
  // Native drag (not a simulated camera call) must pause GPS following.
  await page.mouse.move(box.x+70,box.y+150);await page.mouse.down();
  await page.mouse.move(box.x+150,box.y+190,{steps:10});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-testid="mode"]')?.textContent==='exploring');
  // Wait until native inertial panning finishes before checking GPS isolation.
  await page.waitForTimeout(1200);
  const center=await map.getAttribute('data-map-center');
  const position=await marker.getAttribute('style');
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('.user-live-marker')?.getAttribute('style')!==previous,position);
  assert.equal(await map.getAttribute('data-map-center'),center,'GPS updates move the pin while manual camera position remains unchanged');
  await page.getByRole('button',{name:'Seguir GPS',exact:true}).click();
  await page.waitForFunction(()=>{
    const el=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    if(!el?.dataset.mapCenter)return false;
    const [lat,lon]=JSON.parse(el.dataset.mapCenter);
    return Math.abs(lat+23.555)<0.00001 && Math.abs(lon+46.625)<0.00001;
  });
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'following');
  assert.equal(Number(await map.getAttribute('data-map-zoom')),16,'recenter preserves navigation zoom');
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/maplibre-standalone-navigation.png'});
  await page.getByRole('button',{name:'Remover mapa',exact:true}).click();
  assert.equal(await page.locator('.maplibregl-canvas').count(),0);
  // A missing vector style must restore the existing hybrid/raster renderer.
  await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
  await page.reload();
  await page.locator('.leaflet-container').waitFor({timeout:20000});
  assert.equal(await page.locator('[data-map-engine="maplibre-standalone"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: native MapLibre canvas, gestures, GPS isolation, recenter and vector failure fallback.');
}catch(error){throw error;}
finally{await browser?.close();await vite.close();}

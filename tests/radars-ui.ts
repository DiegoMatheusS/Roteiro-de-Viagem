import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}
  ]}}));
  await page.route('**/api/**',route=>route.fulfill({json:{stations:[],places:[],available:false}}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-detail.html?radars=1');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapReady==='true');
  const checkDetails=async()=>{
    const marker=page.locator('.road-alert-marker');await marker.waitFor();
    await marker.focus();await marker.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Confirmar ocorrência no mapa'});
    await dialog.getByRole('heading',{name:'Radar de velocidade · 60 km/h',exact:true}).waitFor();
    assert.match(await dialog.getByTestId('radar-source').innerText(),/Pardal.*CET-SP\+OSM/s);
    assert.match(await dialog.getByTestId('radar-source').innerText(),/ODbL 1.0/);
    assert.doesNotMatch(await dialog.innerText(),/colaboradores/i);
    assert.equal(await dialog.getByRole('button',{name:'Sim',exact:true}).count(),0);
    assert.equal(await dialog.getByRole('button',{name:'Não',exact:true}).count(),0);
    await page.waitForFunction(()=>{
      const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
      const marker=document.querySelector<HTMLElement>('.road-alert-marker');
      if(!dialog||!marker||getComputedStyle(dialog).visibility!=='visible')return false;
      const box=dialog.getBoundingClientRect(),pin=marker.getBoundingClientRect();
      const gap=Math.max(pin.top-box.bottom,box.top-pin.bottom);
      return box.left>=0&&box.right<=390&&gap>=2&&gap<=14;
    });
    await dialog.getByRole('heading').click();
    await dialog.waitFor({state:'visible'});
    return dialog;
  };
  const first=await checkDetails();
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/radar-pardal-details.png'});
  await page.mouse.click(16,530);
  await first.waitFor({state:'hidden'});
  await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  await page.locator('[data-map-engine="leaflet-fallback"]').waitFor();
  const fallback=await checkDetails();
  await page.mouse.click(16,530);
  await fallback.waitFor({state:'hidden'});
  await page.mouse.move(180,280);
  for(let i=0;i<6;i++) await page.mouse.wheel(0,640);
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('[data-map-engine="leaflet-fallback"]')?.dataset.mapZoom)<12);
  assert.equal(await page.locator('.road-alert-marker').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: radar balloons stay anchored, close outside, and hide with their markers on distant zoom.');
}finally{await browser.close();await vite.close();}

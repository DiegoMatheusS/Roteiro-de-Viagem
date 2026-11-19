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
    assert.equal(await dialog.getByRole('button',{name:'Sim',exact:true}).count(),0);
    assert.equal(await dialog.getByRole('button',{name:'Não',exact:true}).count(),0);
    const box=await dialog.boundingBox();assert.ok(box);assert.ok(box.x>=0&&box.x+box.width<=390);
    return dialog;
  };
  const first=await checkDetails();
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/radar-pardal-details.png'});
  await first.getByRole('button',{name:'Fechar confirmação de ocorrência'}).click();
  await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  await page.locator('[data-map-engine="leaflet-fallback"]').waitFor();
  await checkDetails();
  assert.deepEqual(errors,[]);
  console.log('PASS: imported radar details and attribution work in MapLibre and Leaflet without community-only voting controls.');
}finally{await browser.close();await vite.close();}

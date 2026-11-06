import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {ROAD_ALERT_TYPES} from '../src/types/roadAlerts';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:420,height:850}}),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/road-alert-art.html');
  await page.locator('[data-map-art="oil_spill"] image').waitFor({state:'attached'});
  assert.equal((await page.request.get('http://127.0.0.1:3000/icons/road-alerts.png')).status(),200);
  await page.evaluate(async()=>{const img=new Image();img.src='/icons/road-alerts.png';await img.decode();});
  assert.equal(await page.locator('article').count(),ROAD_ALERT_TYPES.length);
  for(const type of ROAD_ALERT_TYPES.filter(item=>item.id!=='pothole')){
    const sources=await page.locator(`article [data-road-alert-art="${type.id}"] image`).evaluateAll(elements=>elements.map(el=>el.getAttribute('href')));
    assert.deepEqual(sources,['/icons/road-alerts.png','/icons/road-alerts.png'],'menu/banner and DOM map pins use the same supplied artwork');
  }
  await page.getByTestId('road-alert-banner').getByText('Óleo na pista a 240 metros',{exact:true}).waitFor();
  assert.equal(await page.locator('.rdv-nav-upcoming-icon-badge').count(),0);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/road-alert-art.png',fullPage:true});
  await page.getByRole('button',{name:'Reportar problema na estrada'}).click();
  const menu=page.getByRole('menu',{name:'Escolher ocorrência'});await menu.waitFor();
  assert.equal(await menu.getByRole('menuitem').count(),ROAD_ALERT_TYPES.length+1);
  assert.equal(await menu.locator('image').count(),11);
  await page.screenshot({path:'test-results/road-alert-menu.png'});
  await menu.getByRole('menuitem',{name:'Óleo na pista',exact:true}).click();
  await page.getByRole('dialog',{name:'Reportar ocorrência na via'}).getByText('Óleo na pista',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: supplied artwork across 11 alert drawings, map pins, accessible menu and oil-spill navigation banner.');
}finally{await browser.close();await vite.close();}

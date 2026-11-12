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
  await page.context().grantPermissions(['geolocation'],{origin:'http://127.0.0.1:3000'});
  await page.context().setGeolocation({latitude:-23.55,longitude:-46.63,accuracy:5});
  let requests=0;
  await page.route('**/api/road-alerts',async route=>{
    requests++;
    const body=route.request().postDataJSON();
    assert.equal(body.kind,'oil_spill');
    assert.deepEqual(body.coords,[-23.55,-46.63]);
    if(requests===1)await route.fulfill({status:503,json:{error:'Falha simulada no envio.'}});
    else await route.fulfill({status:201,json:{id:'road-alert-test',status:'pending',message:'Enviado para análise.'}});
  });
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
  const dialog=page.getByRole('dialog',{name:'Reportar ocorrência na via'});
  await dialog.getByText('Óleo na pista',{exact:true}).waitFor();
  const slider=dialog.getByRole('button',{name:'Deslize para alertar'});
  await slider.press('Enter');
  await dialog.getByRole('alert').getByText('Falha simulada no envio.').waitFor();
  assert.equal(requests,1,'falha não marca alerta como enviado');
  assert.equal(await page.getByTestId('road-alert-success-toast').count(),0);
  assert.equal(await dialog.isVisible(),true,'falha mantém o formulário para tentar novamente');
  // Ao completar o gesto, o mapa deve voltar sem clique adicional.
  const rect=await slider.boundingBox();assert.ok(rect);
  const y=rect.y+rect.height/2;
  await page.mouse.move(rect.x+31,y);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width-12,y,{steps:15});
  await page.mouse.up();
  await dialog.waitFor({state:'hidden'});
  const toast=page.getByTestId('road-alert-success-toast');
  await toast.waitFor({state:'visible'});
  assert.equal((await toast.innerText()).trim(),'Enviado com sucesso');
  assert.equal(await toast.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
    'notificação não pode bloquear navegação');
  assert.equal(await page.getByRole('dialog',{name:'Reportar ocorrência na via'}).count(),0);
  assert.equal(await page.evaluate(()=>(window as any).__roadAlertSubmitted),1);
  assert.equal(requests,2,'o gesto envia uma única requisição bem-sucedida');
  await toast.waitFor({state:'hidden',timeout:6000});
  assert.equal(await page.getByRole('button',{name:'Reportar problema na estrada'}).isVisible(),true);
  assert.deepEqual(errors,[]);console.log('PASS: arte dos alertas, falha preserva formulário e envio por gesto retorna ao mapa com toast temporário.');
}finally{await browser.close();await vite.close();}

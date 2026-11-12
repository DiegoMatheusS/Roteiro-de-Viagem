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

  // Após o deslize, o servidor confirma, o modal fecha imediatamente e
  // apenas uma notificação temporária aparece por cima do mapa.
  const submitting=await browser.newPage({viewport:{width:420,height:850}});
  submitting.on('pageerror',error=>errors.push(error.message));
  await submitting.context().grantPermissions(['geolocation']);
  await submitting.context().setGeolocation({latitude:-23.55,longitude:-46.63,accuracy:5});
  let submissions=0;
  await submitting.route('**/api/road-alerts',route=>{
    submissions++;
    return submissions===1
      ?route.fulfill({status:201,json:{id:'alert-test',status:'pending',message:'Enviado para moderação'}})
      :route.fulfill({status:503,json:{error:'Falha simulada ao enviar alerta.'}});
  });
  await submitting.goto('http://127.0.0.1:3000/tests/fixtures/road-alert-art.html?submit=1');
  const reporter=submitting.getByRole('button',{name:'Reportar problema na estrada'});
  const confirm=submitting.getByRole('dialog',{name:'Reportar ocorrência na via'});
  const toast=submitting.getByTestId('road-alert-success-toast');
  const swipeOnce=async()=>{
    const slider=confirm.getByRole('button',{name:'Deslize para alertar'});
    const box=await slider.boundingBox();assert.ok(box);
    await submitting.mouse.move(box.x+29,box.y+box.height/2);
    await submitting.mouse.down();
    await submitting.mouse.move(box.x+box.width-9,box.y+box.height/2,{steps:14});
    await submitting.mouse.up();
  };
  await reporter.click();
  await submitting.getByRole('menu',{name:'Escolher ocorrência'})
    .getByRole('menuitem',{name:'Buraco na pista'}).click();
  await confirm.waitFor();
  await swipeOnce();
  await confirm.waitFor({state:'hidden',timeout:10000});
  await toast.waitFor({state:'visible'});
  assert.equal((await toast.innerText()).trim(),'Enviado com sucesso');
  assert.equal(submissions,1,'deslize deve enviar o alerta uma única vez');
  assert.equal(await submitting.getByRole('dialog',{name:'Reportar ocorrência na via'}).count(),0);
  assert.equal(await submitting.getByRole('menu',{name:'Escolher ocorrência'}).count(),0);
  assert.equal(await submitting.getByTestId('road-alert-banner').isVisible(),true,
    'notificação aparece sobre a tela principal, sem ocultar o mapa');
  assert.equal(await toast.evaluate(el=>getComputedStyle(el).pointerEvents),'none',
    'a notificação não pode bloquear os controles da navegação');
  await submitting.screenshot({path:'test-results/road-alert-success-toast.png'});
  await toast.waitFor({state:'hidden',timeout:6500});

  // Uma falha não pode mostrar sucesso nem fechar a confirmação.
  await reporter.click();
  await submitting.getByRole('menu',{name:'Escolher ocorrência'})
    .getByRole('menuitem',{name:'Buraco na pista'}).click();
  await confirm.waitFor();
  await swipeOnce();
  await confirm.getByText('Falha simulada ao enviar alerta.').waitFor();
  assert.equal(await confirm.isVisible(),true,'erros preservam o formulário para nova tentativa');
  assert.equal(await toast.count(),0,'falha nunca mostra notificação de sucesso');
  assert.equal(submissions,2);
  await submitting.close();

  assert.deepEqual(errors,[]);console.log('PASS: supplied artwork and alert submission returns to map with one short success toast; failures remain open.');
}finally{await browser.close();await vite.close();}

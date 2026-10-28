import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  // Raw JS keeps tsx's naming helpers out of the browser context.
  await page.addInitScript({content:`
    window.__calibrationWatches=new Map();window.__calibrationWatchId=0;
    Object.defineProperty(navigator,'geolocation',{value:{
      watchPosition(success){const id=++window.__calibrationWatchId;window.__calibrationWatches.set(id,success);return id;},
      clearWatch(id){window.__calibrationWatches.delete(id);}
    }});
  `});
  await page.goto('http://127.0.0.1:3000/tests/fixtures/gps-calibration.html');
  const panel=page.getByRole('region',{name:'Precisão do GPS'}),start=panel.getByRole('button',{name:'Calibrar GPS',exact:true});
  await start.click();await page.waitForFunction(()=>(window as any).__calibrationWatches.size===1);
  await page.evaluate(()=>{
    const receive=[...(window as any).__calibrationWatches.values()][0],now=Date.now();
    receive({coords:{latitude:-23.55,longitude:-46.63,accuracy:80,speed:0,heading:null},timestamp:now});
    receive({coords:{latitude:-23.55,longitude:-46.63,accuracy:12,speed:0,heading:null},timestamp:now});
    receive({coords:{latitude:-23.55,longitude:-46.63,accuracy:9,speed:0,heading:null},timestamp:now+1000});
  });
  await panel.getByRole('status').filter({hasText:'Sinal estável · ±9 m'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).__calibrationWatches.size),0);
  await start.click();await page.waitForFunction(()=>(window as any).__calibrationWatches.size===1);
  await panel.getByRole('button',{name:'Cancelar calibração'}).click();
  await panel.getByRole('alert').filter({hasText:'Calibração cancelada'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).__calibrationWatches.size),0);
  await start.click();await page.waitForFunction(()=>(window as any).__calibrationWatches.size===1);
  await page.getByRole('button',{name:'Fechar calibração',exact:true}).click();
  assert.equal(await page.evaluate(()=>(window as any).__calibrationWatches.size),0,'leaving the panel must release GPS');
  await page.getByRole('button',{name:'Abrir calibração',exact:true}).click();
  await start.click();await page.waitForFunction(()=>(window as any).__calibrationWatches.size===1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await panel.getByRole('alert').filter({hasText:'sair da tela'}).waitFor();
  assert.equal(await page.evaluate(()=>(window as any).__calibrationWatches.size),0);
  assert.deepEqual(errors,[]);console.log('PASS: calibration reports observed precision and releases GPS on success, cancel, exit and background.');
}finally{await browser.close();await vite.close();}

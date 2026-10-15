import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
const db=openDatabase(':memory:');const server=createApi({db,mapFetch:async()=>new Response('{"elements":[]}')}).listen(3001,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']:[]});
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation','clipboard-read','clipboard-write'],geolocation:{latitude:-23.55,longitude:-46.63,accuracy:5}});
await context.route('https://**',r=>r.abort());await context.route('https://api.whatsapp.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Composição de teste</title>'}));const page=await context.newPage();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('test-results',{recursive:true});
try{
 await page.goto('http://127.0.0.1:3000');await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Perfil',exact:true}).click();await page.getByRole('button',{name:'Segurança & SOS',exact:true}).click();
 await page.getByLabel('Nome do contato',{exact:true}).fill('Contato de teste');await page.getByLabel('Telefone do contato',{exact:true}).fill('+55 (11) 99999-9999');await page.getByLabel('Relação com o contato',{exact:true}).fill('Família');await page.getByRole('button',{name:'Adicionar contato de emergência',exact:true}).click();await page.getByText('+5511999999999',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.getByRole('button',{name:'SOS',exact:true}).click();const sos=page.getByRole('dialog',{name:'SOS',exact:true});await sos.getByText(/Localização obtida pelo GPS/).waitFor();
 assert.equal(await sos.getByRole('link',{name:/Polícia Militar/}).getAttribute('href'),'tel:190');
 await sos.getByRole('button',{name:'Copiar Localização para Enviar',exact:true}).click();await sos.getByText('Mensagem e link do mapa copiados!',{exact:true}).waitFor();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/maps.google.com\/\?q=-23.55,-46.63/);
 const popupPromise=page.waitForEvent('popup');await sos.getByRole('button',{name:'Enviar localização para Contato de teste no WhatsApp',exact:true}).click();const popup=await popupPromise;await popup.waitForURL(/api.whatsapp.com/).catch(()=>{});const url=new URL(popup.url());assert.equal(url.searchParams.get('phone'),'5511999999999');assert.match(url.searchParams.get('text')!,/Precisão aproximada: 5 m/);await popup.close();
 await page.screenshot({path:'test-results/sos-mobile.png'});await sos.getByRole('button',{name:'Fechar SOS',exact:true}).click();
 await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Perfil',exact:true}).click();await page.getByRole('button',{name:'Segurança & SOS',exact:true}).click();await page.getByRole('button',{name:'Remover contato Contato de teste',exact:true}).click();assert.equal(await page.getByText('+5511999999999',{exact:false}).count(),0);
 await context.clearPermissions();await page.evaluate(()=>{navigator.geolocation.watchPosition=(_ok,fail)=>{queueMicrotask(()=>fail!({code:1} as GeolocationPositionError));return 1;};});await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('button',{name:'Mapa',exact:true}).click();await page.getByRole('button',{name:'SOS',exact:true}).click();await sos.getByText(/Permita o acesso à localização/).waitFor();assert.equal(await sos.getByRole('button',{name:'Abrir SOS no WhatsApp',exact:true}).isDisabled(),true);assert.equal(await sos.getByRole('button',{name:'Copiar Localização para Enviar',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('PASS: contatos reais, SOS com localização recente, telefone sem duplicar DDI, cópia, composição e permissão negada.');
}catch(error){await page.screenshot({path:'test-results/sos-failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await vite.close();await new Promise<void>(r=>server.close(()=>r()));db.close();}

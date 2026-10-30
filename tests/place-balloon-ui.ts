import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import sharp from 'sharp';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const tile=await sharp({create:{width:256,height:256,channels:3,background:'#eaf0ef'}}).png().toBuffer();
const price=(type:string,value:number)=>({id:type,fuelType:type,price:value,observedAt:'2026-10-30T14:00:00Z',publishedAt:'2026-10-30T14:00:00Z',stale:false,disputed:false});
const base={id:'balloon-fuel',name:'Posto do balão',kind:'fuel',lat:-23.5503,lng:-46.6302,
  address:'Rua de teste',sourceUrl:'https://www.openstreetmap.org/node/111',description:'',website:'',phone:'',active:true,managed:true};
fs.mkdirSync('test-results',{recursive:true});
try{
  for(const raster of [false,true])for(const theme of ['light','dark']){
    const page=await browser.newPage({viewport:{width:420,height:850}});page.setDefaultTimeout(15000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(theme=>localStorage.setItem('role:map-appearance:v1',theme),theme);
    if(raster)await page.addInitScript({content:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
    await page.route(/^https:\/\//,route=>route.request().resourceType()==='image'?route.fulfill({body:tile,contentType:'image/png'}):route.abort());
    await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
    await page.route('https://*.tile.openstreetmap.org/**',route=>route.fulfill({body:tile,contentType:'image/png'}));
    let submitted:any=null,attempts=0;
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/me')return route.fulfill({json:{user:{id:'balloon-user',displayName:'Teste',role:'user'}}});
      if(path==='/api/stations/search')return route.fulfill({json:{stations:[],mapUnavailable:false}});
      if(path==='/api/places/search')return route.fulfill({json:{places:[base,
        {...base,id:'balloon-park',kind:'park',name:'Parque das árvores',lat:-23.5485,lng:-46.6305},
        {...base,id:'balloon-theatre',kind:'theatre',name:'Teatro das máscaras',lat:-23.5505,lng:-46.6285},
        {...base,id:'balloon-square',kind:'square',name:'Praça da gangorra',lat:-23.5515,lng:-46.6305}]}});
      if(path==='/api/stations/balloon-fuel')return route.fulfill({json:{...base,prices:[price('gasolina_comum',5.899),price('etanol',3.799),price('diesel_s10',6.199)]}});
      if(path.endsWith('/feedback')){
        if(route.request().method()==='POST'){
          submitted=route.request().postDataJSON();attempts++;
          return route.fulfill(attempts===1?{status:503,json:{error:'Conexão temporariamente indisponível.'}}:{status:201,json:{message:'Respostas enviadas.',average:4.2,count:8,myRating:4}});
        }
        return route.fulfill({json:{average:4.2,count:7,myRating:submitted?.rating??null}});
      }
      return route.fulfill({json:{items:[],places:[],stations:[]}});
    });
    await page.goto('http://127.0.0.1:3000/tests/fixtures/place-balloon.html'+(theme==='dark'?'?navigation=1':''));
    const pin=page.getByRole('button',{name:'Ver Posto do balão',exact:true});await pin.waitFor();
    await pin.press('Enter');
    const balloon=page.getByRole('region',{name:'Detalhes de Posto do balão'});
    await balloon.getByText('R$ 5,899/L',{exact:true}).waitFor();
    await balloon.getByText('R$ 3,799/L',{exact:true}).waitFor();
    await balloon.getByText('R$ 6,199/L',{exact:true}).waitFor();
    await balloon.getByRole('img',{name:'Avaliação 4,2 de 5, 7 avaliações'}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.role-place-balloon-popup')].every(el=>Number(getComputedStyle(el).opacity)>.99));
    assert.equal(await page.getByRole('dialog').count(),0,'first tap stays in a speech balloon on the map');
    const bounds=await balloon.boundingBox();assert.ok(bounds&&bounds.width<310&&bounds.height<300);
    assert.equal((await pin.textContent())?.trim(),'','the closed pin has no place name');
    const tail=await page.locator('.role-place-balloon-popup').evaluate(el=>{
      const box=el.getBoundingClientRect();
      if(el.classList.contains('leaflet-popup')){
        const tip=el.querySelector('.leaflet-popup-tip-container')!.getBoundingClientRect();
        return {x:tip.x+tip.width/2,y:tip.bottom};
      }
      const anchor=[...el.classList].find(name=>name.startsWith('maplibregl-popup-anchor-'))||'';
      return {x:anchor.includes('left')?box.left:anchor.includes('right')?box.right:box.x+box.width/2,
        y:anchor.includes('top')?box.top:anchor.includes('bottom')?box.bottom:box.y+box.height/2};
    });
    const icon=await pin.boundingBox();assert.ok(icon);
    const tailDistance=Math.hypot(tail.x-icon.x-icon.width/2,tail.y-icon.y-icon.height/2);
    assert.ok(tailDistance<36,`balloon tail stays on the selected icon edge (${tailDistance}px)`);
    const tone=await balloon.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el.closest('.maplibregl-popup-content,.leaflet-popup-content-wrapper')!).backgroundColor}));
    assert.notEqual(tone.color,tone.background,'balloon foreground differs from its surface');
    await page.screenshot({path:`test-results/place-balloon-${raster?'raster':'native'}-${theme}.png`});
    await balloon.getByRole('button',{name:'Indicar preço',exact:true}).click();
    const prices=page.getByRole('dialog',{name:'Preços do posto'});await prices.getByRole('textbox',{name:'Preço 1',exact:true}).waitFor();
    await prices.getByRole('button',{name:'Fechar posto'}).click();
    await pin.press('Space');
    await balloon.getByRole('button',{name:'Avaliar ou informar problema no estabelecimento'}).click();
    const modal=page.getByRole('dialog',{name:'Avaliar e informar sobre o estabelecimento'});
    await modal.waitFor();const send=modal.getByRole('button',{name:'Enviar',exact:true});assert.equal(await send.isDisabled(),true);
    await modal.getByRole('radio',{name:'4 estrelas',exact:true}).check();
    for(const [question,answer] of [['Estabelecimento não existe?','Não'],['Nome incorreto?','Sim'],['Tipo de estabelecimento incorreto?','Não']])
      await modal.getByRole('group',{name:question,exact:true}).getByRole('radio',{name:answer,exact:true}).check();
    assert.equal(await send.isEnabled(),true);
    await page.screenshot({path:`test-results/place-feedback-form-${raster?'raster':'native'}-${theme}.png`});
    await send.click();
    await modal.getByRole('alert').filter({hasText:'Conexão temporariamente indisponível'}).waitFor();
    const firstId=submitted.submissionId;await send.click();await modal.getByRole('status').filter({hasText:'Respostas enviadas.'}).waitFor();
    assert.equal(submitted.rating,4);assert.equal(submitted.notExists,false);assert.equal(submitted.incorrectName,true);assert.equal(submitted.incorrectKind,false);
    assert.equal(submitted.submissionId,firstId,'retry preserves the same idempotent submission');
    await page.screenshot({path:`test-results/place-feedback-${raster?'raster':'native'}-${theme}.png`});
    await modal.getByRole('button',{name:'Concluir'}).click();
    for(const [name,kind] of [['Parque das árvores','park'],['Teatro das máscaras','theatre'],['Praça da gangorra','square']]){
      const marker=page.getByRole('button',{name:`Ver ${name}`,exact:true});
      assert.equal(await marker.locator('.rdv-map-place-icon').getAttribute('data-place-kind'),kind);
      await marker.press('Enter');await page.getByRole('region',{name:`Detalhes de ${name}`,exact:true}).waitFor();
      await marker.press('Enter');
    }
    await pin.press('Enter');await balloon.waitFor();
    assert.equal(await page.evaluate(()=>{const event=new Event('rdv:close-overlay',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);
    await balloon.waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Place balloons: fuel prices, rating stars, anchored tail, category icons, price editor and idempotent feedback passed in both engines and themes.');
}catch(error){
  for(const context of browser.contexts())for(const page of context.pages()){
    console.error(await page.evaluate(()=>document.body.innerText.slice(0,1400)).catch(()=>''));
    await page.screenshot({path:'test-results/place-balloon-failure.png'}).catch(()=>{});
  }throw error;
}finally{await browser.close();await vite.close();}

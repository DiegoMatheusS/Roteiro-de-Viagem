import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import sharp from 'sharp';
import type {Place} from '../src/types/admin';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const png=await sharp({create:{width:256,height:256,channels:3,background:'#eaf0ef'}}).png().toBuffer();
const base:Place={id:'osm:node:100',name:'Parque cadastrado',kind:'park',lat:-23.5501,lng:-46.63,
  address:'Endereço confirmado',sourceUrl:'https://www.openstreetmap.org/node/100',
  description:'',phone:'',website:'',active:true,managed:true};
fs.mkdirSync('test-results',{recursive:true});
try{
 for(const raster of [false,true]){
  const page=await browser.newPage({viewport:{width:420,height:850}});page.setDefaultTimeout(20000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  if(raster)await page.addInitScript({content:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
  await page.route('https://**',route=>route.abort());
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
  await page.route('https://*.tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:png}));
  let phase=0,calls=0,otherArea=false,catalogUnavailable=false;
  await page.route('**/api/places/search',async route=>{
    calls++;const body=route.request().postDataJSON();
    if(catalogUnavailable){await route.fulfill({status:503,json:{error:'Temporarily offline'}});return;}
    assert.ok(body.bounds,'map requests must be scoped to the camera');
    assert.equal(body.points.length,1);
    otherArea=body.points[0][0]>-23.48;
    const places=otherArea?[{...base,id:'other-area',name:'Museu no bairro explorado',kind:'museum',lat:-23.4,lng:-46.5}]:[
      ...(phase<2?[base]:[]),
      {...base,id:'osm:node:101',name:'Shopping cadastrado',kind:'shopping',lat:-23.55,lng:-46.63015},
      {...base,id:'osm:node:102',name:'Café cadastrado',kind:'cafe',lat:-23.55,lng:-46.62985},
      ...(body.includeFuel?[{...base,id:'fuel-live',name:'Posto cadastrado',kind:'fuel',lat:-23.5502,lng:-46.6302}]:[]),
      ...(phase>0?[{...base,id:'new-live',name:'Museu cadastrado agora',kind:'museum',lat:-23.5499,lng:-46.63}]:[])
    ];
    await route.fulfill({json:{places}});
  });
  await page.route('**/api/stations/fuel-live',route=>route.fulfill({json:{
    id:'fuel-live',name:'Posto cadastrado',lat:-23.5502,lng:-46.6302,address:'Endereço confirmado',
    source:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/node/501',mapUpdatedAt:'2026-10-29',prices:[]
  }}));
  await page.route('**/api/**',async(route)=>{
    if(route.request().url().endsWith('/places/search')||route.request().url().endsWith('/stations/fuel-live'))return route.fallback();
    await route.fulfill({json:{items:[],places:[],stations:[]}});
  });
  await page.goto('http://127.0.0.1:3000/tests/fixtures/registered-places.html');
  const pin=(name:string)=>page.locator(`.managed-place-marker[aria-label="Ver ${name}"]`);
  await pin('Shopping cadastrado').waitFor({state:'visible'});
  await pin('Café cadastrado').waitFor({state:'visible'});
  await pin('Parque cadastrado').waitFor({state:'visible'});
  for(const marker of await page.locator('.managed-place-marker').all()){
    assert.equal((await marker.textContent())?.trim(),'','registered places are symbols only');
    assert.equal(await marker.getAttribute('title'),null,'no name tooltip over the map');
  }
  assert.equal(await pin('Posto cadastrado').count(),0);
  catalogUnavailable=true;
  await page.getByRole('button',{name:'Alternar postos de teste'}).click();
  await pin('Posto cadastrado').waitFor({state:'visible'});
  await pin('Posto cadastrado').click();
  await page.getByRole('region',{name:'Detalhes de Posto cadastrado'}).getByRole('button',{name:'Indicar preço',exact:true}).click();
  const stationDialog=page.getByRole('dialog',{name:'Preços do posto'});
  await stationDialog.waitFor({state:'visible'});
  await stationDialog.getByRole('heading',{name:'Posto cadastrado'}).waitFor({state:'visible'});
  await stationDialog.getByRole('textbox',{name:'Preço 1'}).waitFor({state:'visible'});
  await stationDialog.getByRole('button',{name:'Fechar posto'}).click();
  await pin('Shopping cadastrado').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Alternar postos de teste'}).click();
  await pin('Posto cadastrado').waitFor({state:'detached'});
  await pin('Shopping cadastrado').waitFor({state:'visible'});
  catalogUnavailable=false;

  if(!raster){
    await page.waitForFunction(()=>document.querySelector('[data-map-engine="maplibre-standalone"]')?.getAttribute('data-map-ready')==='true');
  }else assert.ok(await page.locator('.leaflet-container').count());
  await page.evaluate(()=>{(window as any).__registeredShop=document.querySelector('[aria-label="Ver Shopping cadastrado"]');});
  await pin('Shopping cadastrado').press('Enter');
  const selectedBalloon=page.getByRole('region',{name:'Detalhes de Shopping cadastrado',exact:true});
  await selectedBalloon.waitFor();
  await page.screenshot({path:`test-results/registered-places-${raster?'raster':'native'}-home.png`});
  phase=1;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await pin('Museu cadastrado agora').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>(window as any).__registeredShop===document.querySelector('[aria-label="Ver Shopping cadastrado"]')),true,'unchanged POIs keep their marker and handlers in both engines');
  await selectedBalloon.waitFor();
  await pin('Shopping cadastrado').press('Enter');
  await selectedBalloon.waitFor({state:'hidden'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const beforePause=calls;await page.waitForTimeout(600);assert.equal(calls,beforePause,'background maps stop polling');
  phase=2;
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(250);
  await pin('Parque cadastrado').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Iniciar navegação de teste'}).click();
  await pin('Shopping cadastrado').waitFor({state:'visible'});
  await pin('Café cadastrado').waitFor({state:'visible'});
  assert.ok(!otherArea,'navigation queries its live viewport, not the distant route origin');
  await page.screenshot({path:`test-results/registered-places-${raster?'raster':'native'}-navigation.png`});
  await page.getByRole('button',{name:'Explorar outro bairro'}).click();
  await pin('Museu no bairro explorado').waitFor({state:'visible'});
  await pin('Shopping cadastrado').waitFor({state:'detached'});
  assert.ok(otherArea);
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Registered places: initial map, live refresh, navigation and camera exploration passed in native and raster renderers.');
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages()){
  console.error('Map diagnostic:',await page.evaluate(()=>({text:document.body.innerText.slice(0,1200),maps:[...document.querySelectorAll('[data-map-engine]')].map(node=>({...((node as HTMLElement).dataset)})),markers:document.querySelectorAll('.managed-place-marker').length})).catch(()=>null));
  await page.screenshot({path:'test-results/registered-places-failure.png'}).catch(()=>{});
 }
 throw error;
}finally{await browser.close();await vite.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mapScreenPoint} from './helpers/map-screen-point';

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
  assert.equal(Number(await map.getAttribute('data-map-bearing')),0,'north is the initial mode');
  await page.getByRole('button',{name:'Orientar mapa na direção da viagem',exact:true}).click();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapBearing)-90)<0.00001);
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
  await page.getByRole('button',{name:'Mudar direção GPS',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<SVGElement>('.user-live-marker svg')?.style.transform==='rotate(180deg)');
  assert.equal(Number(await map.getAttribute('data-map-bearing')),90,'GPS course updates must not rotate an explored map');
  await page.getByRole('button',{name:'Seguir GPS',exact:true}).click();
  await page.waitForFunction(()=>{
    const el=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    if(!el?.dataset.mapCenter)return false;
    const [lat,lon]=JSON.parse(el.dataset.mapCenter);
    return Math.abs(lat+23.555)<0.00001 && Math.abs(lon+46.625)<0.00001;
  });
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'following');
  assert.equal(Number(await map.getAttribute('data-map-zoom')),16,'recenter preserves navigation zoom');
  assert.ok(Math.abs(Math.abs(Number(await map.getAttribute('data-map-bearing')))-180)<0.00001,'follow resumes with the latest reliable GPS course');
  await page.getByRole('button',{name:'Manter o mapa apontado para o norte',exact:true}).click();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapBearing))<0.00001);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/maplibre-standalone-navigation.png'});
  await page.getByRole('button',{name:'Remover mapa',exact:true}).click();
  assert.equal(await page.locator('.maplibregl-canvas').count(),0);
  // A missing vector style must restore the existing hybrid/raster renderer.
  await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
  await page.reload();
  await page.locator('.leaflet-container').waitFor({timeout:20000});
  assert.equal(await page.locator('[data-map-engine="maplibre-standalone"]').count(),0);
  // Home/Map share the standalone viewport, but never follow GPS automatically.
  await page.unroute('https://tiles.openfreemap.org/**');
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}
  ]}}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-explore.html');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  assert.equal(await page.locator('.leaflet-container').count(),0);
  assert.equal(await page.getByRole('button',{name:'Orientar mapa na direção da viagem',exact:true}).count(),0);
  await page.waitForFunction(()=>document.querySelector('[data-testid="visible"]')?.textContent?.includes('Mirante local'));
  const beforeCenter=await map.getAttribute('data-map-center');
  const beforeZoom=await map.getAttribute('data-map-zoom');
  const tap=await map.evaluate(mapScreenPoint,[-23.545,-46.62] as [number,number]);
  await page.mouse.click(tap.x,tap.y);
  await page.waitForFunction(()=>document.querySelector('[data-testid="selected"]')?.textContent==='scenic');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  assert.equal(await map.getAttribute('data-map-center'),beforeCenter,'choosing an alternative preserves the camera');
  assert.equal(await map.getAttribute('data-map-zoom'),beforeZoom);
  assert.equal(await page.locator('[data-testid="map-clicks"]').textContent(),'0','route selection must not trigger destination selection');
  const homeMarker=page.locator('.user-live-marker');
  const oldMarker=await homeMarker.getAttribute('style');
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('.user-live-marker')?.getAttribute('style')!==previous,oldMarker);
  assert.equal(await map.getAttribute('data-map-center'),beforeCenter,'home GPS fixes update the pin without moving the viewport');
  await page.getByRole('button',{name:'Centralizar GPS',exact:true}).click();
  await page.waitForFunction(()=>{
    const el=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    if(!el?.dataset.mapCenter)return false;
    const [lat,lon]=JSON.parse(el.dataset.mapCenter);
    return Math.abs(lat+23.555)<0.00001 && Math.abs(lon+46.625)<0.00001 && Number(el.dataset.mapZoom)===15;
  });
  await page.waitForFunction(()=>document.querySelector('[data-testid="visible"]')?.textContent==='');
  // Detail/convoy maps retain native markers and camera across base changes.
  const tile=await sharp({create:{width:256,height:256,channels:4,background:'#dce8d8'}}).png().toBuffer();
  await page.route('https://server.arcgisonline.com/**',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:tile}));
  await page.route('https://*.tile.opentopomap.org/**',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:tile}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-detail.html');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  assert.equal(await page.locator('.leaflet-container').count(),0);
  const organizer=page.locator('.convoy-participant-marker[title="Organizador"]');
  const rider=page.locator('.convoy-participant-marker[title="Participante"]');
  await organizer.waitFor();await rider.waitFor();
  const organizerElement=await organizer.elementHandle();assert.ok(organizerElement);
  const detailCenter=await map.getAttribute('data-map-center');
  const detailZoom=await map.getAttribute('data-map-zoom');
  await page.locator('.meeting-point-marker').click();
  await page.locator('.maplibregl-popup').waitFor();
  for(const [style,label] of [['satellite','Satélite Real'],['topo','Relevo / Serras'],['light','Claro (MapLibre)']] as const){
    await page.getByTitle('Alterar visual do mapa').click();
    await page.getByRole('button',{name:new RegExp(label.replace(/[()]/g,'\\$&'))}).click();
    await page.waitForFunction(expected=>{
      const root=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
      return root?.dataset.mapStyleReady===expected && root.dataset.mapIdle==='true';
    },style);
    assert.equal(await map.getAttribute('data-map-center'),detailCenter);
    assert.equal(await map.getAttribute('data-map-zoom'),detailZoom);
    assert.equal(await organizerElement.evaluate(element=>element.isConnected),true,'style changes preserve existing participants');
    assert.equal(await page.locator('.meeting-point-marker').count(),1);
    assert.equal(await page.locator('.maplibregl-popup').count(),1,'meeting popup stays open');
    assert.ok(Number(await page.locator('[data-role-vector-routes]').getAttribute('data-role-vector-routes'))>0);
  }
  await page.locator('.maplibregl-popup-close-button').click();
  const meeting=page.locator('.meeting-point-marker');
  await meeting.focus();
  await meeting.press('Enter');
  assert.equal(await page.locator('.maplibregl-popup').count(),1,'Enter opens exactly once');
  await meeting.press('Space');
  assert.equal(await page.locator('.maplibregl-popup').count(),0,'Space closes exactly once');
  const fixedBefore=await organizer.boundingBox(),riderBefore=await rider.boundingBox();
  assert.ok(fixedBefore && riderBefore);
  await page.getByRole('button',{name:'Mover participante',exact:true}).click();
  await page.waitForFunction(previous=>{
    const rect=document.querySelector('.convoy-participant-marker[title="Participante"]')?.getBoundingClientRect();
    return rect && Math.hypot(rect.x-previous.x,rect.y-previous.y)>2;
  },riderBefore);
  const fixedAfter=await organizer.boundingBox();assert.ok(fixedAfter);
  assert.ok(Math.hypot(fixedAfter.x-fixedBefore.x,fixedAfter.y-fixedBefore.y)<=1,
    'one GPS update must not move other participants (allow pixel rounding)');
  assert.equal(await organizerElement.evaluate(element=>element.isConnected),true);
  assert.equal(await map.getAttribute('data-map-center'),detailCenter);
  assert.equal(await map.getAttribute('data-map-zoom'),detailZoom);
  // A raster provider failure retains that chosen style in the hybrid fallback.
  await page.unroute('https://server.arcgisonline.com/**');
  await page.route('https://server.arcgisonline.com/**',route=>route.abort());
  await page.getByTitle('Alterar visual do mapa').click();
  await page.getByRole('button',{name:/Satélite Real/}).click();
  await page.locator('.leaflet-container').waitFor({timeout:20000});
  assert.ok((await page.getByTitle('Alterar visual do mapa').textContent())?.includes('Satélite Real'));
  assert.deepEqual(errors,[]);
  console.log('PASS: native navigation, home, detail/convoy, raster bases, participant updates and fallback.');
}catch(error){throw error;}
finally{await browser?.close();await vite.close();}

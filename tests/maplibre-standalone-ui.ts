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
  const exploredZoom=await map.getAttribute('data-map-zoom');
  await page.getByRole('button',{name:'Manter o mapa apontado para o norte',exact:true}).click();
  await page.waitForFunction(()=>Math.abs(Number(document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapBearing))<0.00001);
  const northCenter=JSON.parse((await map.getAttribute('data-map-center'))!);
  const exploredCenter=JSON.parse(center!);
  assert.ok(northCenter.every((value:number,index:number)=>Math.abs(value-exploredCenter[index])<1e-8),'explicit north preserves the explored center');
  assert.equal(await map.getAttribute('data-map-zoom'),exploredZoom);
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'exploring','compass must not resume GPS');
  await page.getByRole('button',{name:'Orientar mapa na direção da viagem',exact:true}).click();
  await page.waitForFunction(()=>Math.abs(Math.abs(Number(document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapBearing))-180)<0.00001);
  const courseCenter=JSON.parse((await map.getAttribute('data-map-center'))!);
  assert.ok(courseCenter.every((value:number,index:number)=>Math.abs(value-exploredCenter[index])<1e-8),'explicit course preserves the explored center');
  assert.equal(await map.getAttribute('data-map-zoom'),exploredZoom);
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'exploring');

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
  // A recalculated route must not zoom out or move the live GPS camera.
  const routeCenter=await map.getAttribute('data-map-center');
  const routeZoom=await map.getAttribute('data-map-zoom');
  await page.getByRole('button',{name:'Novo percurso',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="route-target"]')?.textContent==='-23.7,-46.4');
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  assert.equal(await map.getAttribute('data-map-center'),routeCenter,'new navigation route keeps live GPS center');
  assert.equal(await map.getAttribute('data-map-zoom'),routeZoom,'new navigation route keeps driver zoom');
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'following');
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/maplibre-standalone-navigation.png'});
  // A context loss after manual zoom preserves the camera and the consumed
  // recenter request. Later GPS readings cannot silently resume following.
  await page.mouse.move(box.x+70,box.y+150);
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(()=>{
    const root=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    return root?.dataset.mapIdle==='true' && Number(root.dataset.mapZoom)>16;
  });
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'exploring');
  const lossCenter=JSON.parse((await map.getAttribute('data-map-center'))!);
  const lossZoom=Number(await map.getAttribute('data-map-zoom'));
  await page.locator('.maplibregl-canvas').evaluate(canvas=>
    canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  const fallback=page.locator('[data-map-engine="leaflet-fallback"]');
  await fallback.waitFor();
  await page.waitForFunction(()=>!!document.querySelector<HTMLElement>('[data-map-engine="leaflet-fallback"]')?.dataset.mapCenter);
  const restoredCenter=JSON.parse((await fallback.getAttribute('data-map-center'))!);
  assert.ok(Math.abs(restoredCenter[0]-lossCenter[0])<0.00001 && Math.abs(restoredCenter[1]-lossCenter[1])<0.00001);
  assert.equal(Number(await fallback.getAttribute('data-map-zoom')),lossZoom,'fractional zoom survives fallback');
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'exploring');
  const fallbackPin=page.locator('.user-live-marker').first();await fallbackPin.waitFor();
  const pinBefore=await fallbackPin.getAttribute('style');
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('.user-live-marker')?.getAttribute('style')!==previous,pinBefore);
  assert.equal(await fallback.getAttribute('data-map-center'),JSON.stringify(restoredCenter));
  assert.equal(Number(await fallback.getAttribute('data-map-zoom')),lossZoom);
  await page.getByRole('button',{name:'Seguir GPS',exact:true}).click();
  await page.waitForFunction(()=>{
    const root=document.querySelector<HTMLElement>('[data-map-engine="leaflet-fallback"]');
    if(!root?.dataset.mapCenter)return false;
    const [lat,lon]=JSON.parse(root.dataset.mapCenter);
    return Math.abs(lat+23.56)<0.00001 && Math.abs(lon+46.62)<0.00001;
  });
  assert.equal(await page.locator('[data-testid="mode"]').textContent(),'following');
  // Even in raster fallback, a refreshed itinerary cannot steal a resumed GPS view.
  const fallbackRouteCenter=await fallback.getAttribute('data-map-center');
  const fallbackRouteZoom=await fallback.getAttribute('data-map-zoom');
  await page.getByRole('button',{name:'Novo percurso',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="route-target"]')?.textContent==='-23.8,-46.5');
  assert.equal(await fallback.getAttribute('data-map-center'),fallbackRouteCenter);
  assert.equal(await fallback.getAttribute('data-map-zoom'),fallbackRouteZoom);
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
  const placesCenter=await map.getAttribute('data-map-center');
  const placesZoom=await map.getAttribute('data-map-zoom');
  await page.getByRole('button',{name:'Atualizar descrição',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="visible-address"]')?.textContent==='Mirante atualizado');
  assert.equal(await map.getAttribute('data-map-center'),placesCenter,'place metadata does not move the camera');
  assert.equal(await map.getAttribute('data-map-zoom'),placesZoom,'place metadata does not change zoom');
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
  const canvasBox=await page.locator('.maplibregl-canvas').boundingBox();
  const selectorBox=await page.getByTitle('Alterar visual do mapa').boundingBox();
  assert.ok(canvasBox && selectorBox);
  assert.ok(selectorBox.y>=canvasBox.y+canvasBox.height,'closed base controls must not cover marker canvas');
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
  const rasterFallback=page.locator('[data-map-engine="leaflet-fallback"]');
  const rasterCenter=JSON.parse((await rasterFallback.getAttribute('data-map-center'))!);
  const oldDetailCenter=JSON.parse(detailCenter!);
  assert.ok(Math.abs(rasterCenter[0]-oldDetailCenter[0])<0.0001 && Math.abs(rasterCenter[1]-oldDetailCenter[1])<0.0001);
  assert.equal(await rasterFallback.getAttribute('data-map-zoom'),detailZoom);
  // Permission can be granted before the first position. Repeated center
  // requests coalesce and survive a renderer failure while GPS is unavailable.
  for(const scenario of ['native','cold-fallback','pending-handoff'] as const){
    await page.unroute('https://tiles.openfreemap.org/**');
    await page.route('https://tiles.openfreemap.org/**',route=>scenario==='cold-fallback'?route.abort():
      route.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-pending-gps.html');
    const engine=scenario==='cold-fallback'?'leaflet-fallback':'maplibre-standalone';
    await page.waitForFunction(engine=>{
      const root=document.querySelector<HTMLElement>(`[data-map-engine="${engine}"]`);
      return root?.dataset.mapCenter && (engine==='leaflet-fallback'||root.dataset.mapIdle==='true');
    },engine);
    const camera=page.locator('[data-map-engine]');
    const waitingCenter=await camera.getAttribute('data-map-center');
    const waitingZoom=await camera.getAttribute('data-map-zoom');
    await page.getByRole('button',{name:'Centralizar GPS',exact:true}).click();
    await page.getByRole('button',{name:'Centralizar GPS',exact:true}).click();
    assert.equal(await page.locator('[data-testid="request"]').textContent(),'2');
    assert.equal(await camera.getAttribute('data-map-center'),waitingCenter,'missing GPS must not move camera');
    assert.equal(await camera.getAttribute('data-map-zoom'),waitingZoom);
    if(scenario==='pending-handoff'){
      await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
      await page.locator('[data-map-engine="leaflet-fallback"]').waitFor();
    }
    await page.getByRole('button',{name:'Receber GPS',exact:true}).click();
    await page.waitForFunction(()=>{
      const root=document.querySelector<HTMLElement>('[data-map-engine]');
      if(!root?.dataset.mapCenter)return false;
      const [lat,lon]=JSON.parse(root.dataset.mapCenter);
      return Math.abs(lat+23.555)<0.00001 && Math.abs(lon+46.625)<0.00001 && Number(root.dataset.mapZoom)===15;
    });
    const completedCenter=await camera.getAttribute('data-map-center');
    const livePin=page.locator('.user-live-marker').first();await livePin.waitFor();
    const oldPin=await livePin.getAttribute('style');
    await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
    await page.waitForFunction(previous=>document.querySelector('.user-live-marker')?.getAttribute('style')!==previous,oldPin);
    assert.equal(await camera.getAttribute('data-map-center'),completedCenter,'later GPS fixes must not repeat a completed request');
    await page.getByRole('button',{name:'Centralizar GPS',exact:true}).click();
    await page.waitForFunction(()=>{
      const root=document.querySelector<HTMLElement>('[data-map-engine]');
      if(!root?.dataset.mapCenter)return false;
      const [lat,lon]=JSON.parse(root.dataset.mapCenter);
      return Math.abs(lat+23.58)<0.00001 && Math.abs(lon+46.6)<0.00001;
    });
    await page.getByRole('button',{name:'GPS indisponível',exact:true}).click();
    await page.getByRole('button',{name:'Centralizar GPS',exact:true}).click();
    await page.getByRole('button',{name:'Receber GPS',exact:true}).click();
    await page.waitForFunction(()=>{
      const root=document.querySelector<HTMLElement>('[data-map-engine]');
      if(!root?.dataset.mapCenter)return false;
      const [lat,lon]=JSON.parse(root.dataset.mapCenter);
      return Math.abs(lat+23.555)<0.00001 && Math.abs(lon+46.625)<0.00001;
    });
  }
  // Exercise the actual active-trip HUD, including the tracking distance wiring.
  await page.route('**/api/**',route=>route.fulfill({json:{alerts:[],stations:[],places:[]}}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/circular-guidance.html');
  const guidance=page.getByRole('status',{name:'Próxima orientação de navegação',exact:true});
  await guidance.getByText('Primeira curva',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Simular volta ao início',exact:true}).click();
  await guidance.getByText('Chegando ao destino',{exact:true}).waitFor();
  await guidance.getByText('Em 0 metros',{exact:true}).waitFor();
  assert.equal(await guidance.getByText('Primeira curva',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Simular cruzamento na ida',exact:true}).click();
  await guidance.getByText('Trecho de ida',{exact:true}).waitFor();
  await guidance.getByText('Vire à direita',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Simular cruzamento na volta',exact:true}).click();
  await guidance.getByText('Trecho de volta',{exact:true}).waitFor();
  await guidance.getByText('Vire à esquerda',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Simular fora da rota',exact:true}).click();
  await guidance.getByText('Siga o trajeto indicado',{exact:true}).waitFor();
  assert.equal(await guidance.getByText(/Em .* metros/).count(),0);
  // Refreshing a different area must not momentarily show stations or places
  // from the previous GPS location while the next provider request is pending.
  const discoveryPage=await browser.newPage();
  const discoveryErrors:string[]=[];
  discoveryPage.on('pageerror',error=>discoveryErrors.push(error.message));
  let releaseWait:()=>void=()=>{};
  const bothPending=new Promise<void>(resolve=>{releaseWait=resolve;});
  const pendingReleases:Array<()=>void>=[];
  let waitingCount=0;
  const blockNewArea=async()=>{
    await new Promise<void>(resolve=>{
      pendingReleases.push(resolve);
      if(++waitingCount===2)releaseWait();
    });
  };
  await discoveryPage.route('**/api/stations/search',async route=>{
    const body=route.request().postDataJSON();
    const otherArea=body.points[0][0]===-23.6;
    if(otherArea)await blockNewArea();
    await route.fulfill({json:{
      stations:[{id:otherArea?'station-new':'station-old'}],mapUnavailable:false
    }});
  });
  await discoveryPage.route('**/api/places/search',async route=>{
    const body=route.request().postDataJSON();
    const otherArea=body.points[0][0]===-23.6;
    if(otherArea)await blockNewArea();
    await route.fulfill({json:{places:[{id:otherArea?'place-new':'place-old'}]}});
  });
  await discoveryPage.goto('http://127.0.0.1:3000/tests/fixtures/discovery-hooks.html');
  await discoveryPage.waitForFunction(()=>{
    return document.querySelector('[data-testid="stations"]')?.textContent==='station-old' &&
      document.querySelector('[data-testid="places"]')?.textContent==='place-old';
  });
  await discoveryPage.getByRole('button',{name:'Trocar região'}).click();
  await bothPending;
  assert.equal(await discoveryPage.getByTestId('stations').textContent(),'',
    'changing region immediately hides previous fuel stations');
  assert.equal(await discoveryPage.getByTestId('places').textContent(),'',
    'changing region immediately hides previous tourist and local places');
  for(const release of pendingReleases)release();
  await discoveryPage.waitForFunction(()=>{
    return document.querySelector('[data-testid="stations"]')?.textContent==='station-new' &&
      document.querySelector('[data-testid="places"]')?.textContent==='place-new';
  });
  await discoveryPage.getByRole('button',{name:'Desativar busca'}).click();
  assert.equal(await discoveryPage.getByTestId('stations').textContent(),'');
  assert.equal(await discoveryPage.getByTestId('places').textContent(),'');
  await discoveryPage.getByRole('button',{name:'Ativar busca',exact:true}).click();
  await discoveryPage.waitForFunction(()=>{
    return document.querySelector('[data-testid="stations"]')?.textContent==='station-new' &&
      document.querySelector('[data-testid="places"]')?.textContent==='place-new';
  });
  assert.deepEqual(discoveryErrors,[]);
  await discoveryPage.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: native navigation, home, detail/convoy, raster bases, participant updates and fallback.');
}catch(error){throw error;}
finally{await browser?.close();await vite.close();}

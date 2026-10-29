import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';

// Use real pending raster requests: an empty background style never exercises
// isStyleLoaded() returning false while the viewport is already interactive.
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
let releaseTiles:()=>void=()=>{};
let releasePlaces:()=>void=()=>{};
try{
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
      '--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const placesReady=new Promise<void>(resolve=>{releasePlaces=resolve;});
  await page.route('**/api/places/search',async route=>{
    await placesReady;
    await route.fulfill({json:{places:[{id:'admin:late-place',name:'Local cadastrado após o mapa',
      kind:'park',lat:-23.55,lng:-46.63,address:'Endereço confirmado',sourceUrl:'https://www.openstreetmap.org/',
      description:'',phone:'',website:'',active:true,managed:true}]}});
  });
  const tile=await sharp({create:{width:256,height:256,channels:4,
    background:'#dce8d8'}}).png().toBuffer();
  let tilesReady=new Promise<void>(resolve=>{releaseTiles=resolve;});
  let notifyTile:()=>void=()=>{};
  const tileStarted=new Promise<void>(resolve=>{notifyTile=resolve;});
  let pendingTiles=0;
  await page.route('https://role-test.invalid/tiles/**',async route=>{
    pendingTiles++;
    notifyTile();
    await tilesReady;
    try{await route.fulfill({contentType:'image/png',body:tile});}
    catch{/* Zooming may cancel an obsolete tile request. */}
  });
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{
    version:8,sources:{slow:{type:'raster',tileSize:256,
      tiles:['https://role-test.invalid/tiles/{z}/{x}/{y}.png']}},
    layers:[{id:'slow',type:'raster',source:'slow'}]
  }}));
  await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-map.html');
  const map=page.locator('[data-map-engine="maplibre-standalone"]');
  const marker=page.locator('.user-live-marker');
  await marker.waitFor({timeout:5000});
  await tileStarted;
  assert.ok(pendingTiles>0,'base tiles are still waiting on the network');
  assert.notEqual(await map.getAttribute('data-map-ready'),'true',
    'this assertion must run before the initial map load completes');
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>(
    '[data-map-engine="maplibre-standalone"]')?.dataset.mapZoom)===18.5);
  await page.getByRole('button',{name:'Mudar direção GPS',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector<SVGElement>(
    '.user-live-marker svg')?.style.transform==='rotate(180deg)',{},{timeout:3000});
  releaseTiles();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>(
    '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  releasePlaces();
  await page.getByRole('button',{name:'Ver Local cadastrado após o mapa',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>(
    '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true',undefined,{timeout:3000});

  // Once loaded, a fresh GPS camera move requests another group of tiles.
  // Hold only these requests so the test also covers an already running trip.
  tilesReady=new Promise<void>(resolve=>{releaseTiles=resolve;});
  const nextTilesStarted=new Promise<void>(resolve=>{notifyTile=resolve;});
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
  await nextTilesStarted;
  await page.waitForTimeout(650);

  // Real native pan/pinch events while the tile requests remain unresolved.
  const cdp=await page.context().newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd',points:Array<{x:number;y:number}>)=>cdp.send(
    'Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({
      ...point,id,radiusX:4,radiusY:4,force:1}))});
  const panBefore=await marker.boundingBox();assert.ok(panBefore);
  await touch('touchStart',[{x:90,y:180}]);
  await page.getByRole('button',{name:'Mudar direção GPS',exact:true}).evaluate(button=>(button as HTMLButtonElement).click());
  await page.waitForTimeout(100);
  assert.equal(await marker.locator('svg').evaluate(svg=>svg.style.transform),'rotate(180deg)',
    'hold the newest GPS drawing until the fingers and inertial movement stop');
  for(let i=1;i<=8;i++){
    await touch('touchMove',[{x:90+i*12,y:180+i*6}]);
    await page.waitForTimeout(25);
  }
  await touch('touchEnd',[]);
  await page.waitForFunction(()=>document.querySelector('[data-testid="mode"]')?.textContent==='exploring');
  await page.waitForFunction(()=>document.querySelector<SVGElement>(
    '.user-live-marker svg')?.style.transform==='rotate(270deg)',{},{timeout:3000});
  const panAfter=await marker.boundingBox();assert.ok(panAfter);
  assert.ok(Math.hypot(panAfter.x-panBefore.x,panAfter.y-panBefore.y)>50,
    'drag must follow the whole gesture, not stop after its first small movement');
  await page.waitForTimeout(800);
  const beforeZoom=Number(await map.getAttribute('data-map-zoom'));
  await touch('touchStart',[{x:100,y:260},{x:260,y:260}]);
  for(let i=1;i<=8;i++){
    await touch('touchMove',[{x:100+i*5,y:260},{x:260-i*5,y:260}]);
    await page.waitForTimeout(25);
  }
  await touch('touchEnd',[]);
  await page.waitForFunction(previous=>Number(document.querySelector<HTMLElement>(
    '[data-map-engine="maplibre-standalone"]')?.dataset.mapZoom)<previous-.65,beforeZoom,{timeout:3000});
  console.log('Native pinch zoom change:',Number(await map.getAttribute('data-map-zoom'))-beforeZoom);
  await page.waitForTimeout(800);
  const exploredCenter=await map.getAttribute('data-map-center');
  const oldPin=await marker.getAttribute('style');
  await page.getByRole('button',{name:'Mover GPS',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('.user-live-marker')?.getAttribute('style')!==previous,oldPin);
  assert.equal(await map.getAttribute('data-map-center'),exploredCenter,
    'a new GPS fix must not steal an explored camera while tiles load');
  await page.getByRole('button',{name:'Seguir GPS',exact:true}).click();
  await page.waitForFunction(()=>{
    const root=document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]');
    if(!root?.dataset.mapCenter)return false;
    const [lat,lon]=JSON.parse(root.dataset.mapCenter);
    return Math.abs(lat+23.56)<1e-5&&Math.abs(lon+46.62)<1e-5;
  });
  assert.equal(Number(await map.getAttribute('data-map-zoom')),18.5,
    'GPS restores the initial close zoom after a manual pinch');
  assert.ok(Math.abs(Number(await map.getAttribute('data-map-pitch'))-55)<0.01,
    'GPS restores the initial driving tilt');
  assert.equal(await page.locator('.maplibregl-canvas').count(),1);
  assert.equal(await page.locator('.leaflet-container').count(),0);
  releaseTiles();
  await page.waitForFunction(()=>document.querySelector<HTMLElement>(
    '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
  assert.deepEqual(errors,[]);
  console.log('PASS: pending tiles do not block GPS, heading, native pan/pinch or recenter.');
}finally{
  releasePlaces();
  releaseTiles();
  await browser?.close();
  await vite.close();
}

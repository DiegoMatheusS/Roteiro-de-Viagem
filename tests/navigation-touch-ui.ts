import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mapScreenPoint} from './helpers/map-screen-point';

// Real touch events, including gestures whose first finger lands on the GPS
// arrow. Double-click or mouse-only zoom cannot catch a swallowed touchstart.
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
      '--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const tile=await sharp({create:{width:256,height:256,channels:4,background:'#eaf0ef'}}).png().toBuffer();
  for(const fallback of [false,true]){
    const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true,isMobile:true});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**',route=>route.fulfill({contentType:'image/png',body:tile}));
    await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{
      version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]
    }}));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/standalone-map.html');
    await page.waitForFunction(()=>document.querySelector<HTMLElement>(
      '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
    if(fallback){
      await page.locator('.maplibregl-canvas').evaluate(canvas=>
        canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    }
    const engine=fallback?'leaflet-fallback':'maplibre-standalone';
    const map=page.locator(`[data-map-engine="${engine}"]`);
    await map.waitFor();
    const marker=page.locator('.user-live-marker');
    await marker.waitFor();
    await page.waitForTimeout(600);
    const cdp=await page.context().newCDPSession(page);
    const touch=(type:'touchStart'|'touchMove'|'touchEnd',points:Array<{x:number;y:number}>)=>cdp.send(
      'Input.dispatchTouchEvent',{type,touchPoints:points.map((point,id)=>({
        ...point,id,radiusX:4,radiusY:4,force:1}))});
    const arrowCenter=async()=>{
      const box=await marker.boundingBox();assert.ok(box);
      return {x:box.x+box.width/2,y:box.y+box.height/2};
    };
    const click=async(name:string)=>page.getByRole('button',{name,exact:true})
      .evaluate(button=>(button as HTMLButtonElement).click());
    const recenter=async()=>{
      await click('Seguir GPS');
      await page.waitForFunction(()=>document.querySelector('[data-testid="mode"]')?.textContent==='following');
      await page.waitForTimeout(700);
    };
    const zoom=async()=>Number(await map.getAttribute('data-map-zoom'));
    // Pan begins on the arrow, with GPS arriving while the finger is still
    // held. Neither the marker nor GPS may steal the camera before dragstart.
    let point=await arrowCenter();
    const mapBox=await map.boundingBox();assert.ok(mapBox);
    if(!fallback){
      assert.ok(point.y>mapBox.y+mapBox.height*.58&&point.y<mapBox.y+mapBox.height*.68,
        'the driving arrow sits below center to show more road ahead');
    }
    const initialCenter=await map.getAttribute('data-map-center');
    const original=JSON.parse(initialCenter!) as [number,number];
    const screenBefore=await map.evaluate(mapScreenPoint,original);
    await touch('touchStart',[point]);
    await click('Mover GPS');
    await page.waitForTimeout(100);
    const screenHeld=await map.evaluate(mapScreenPoint,original);
    // Leaflet stop()/setView() can round the unchanged center by a fraction
    // of a pixel. Reject a GPS pan, not harmless Web Mercator pixel rounding.
    assert.ok(Math.hypot(screenHeld.x-screenBefore.x,screenHeld.y-screenBefore.y)<=1,
      `${engine}: GPS must pause on first contact, before the pan threshold`);
    for(let i=1;i<=10;i++){
      await touch('touchMove',[{x:point.x+i*8,y:point.y+i*4}]);
      await page.waitForTimeout(25);
    }
    await touch('touchEnd',[]);
    await page.waitForFunction(()=>document.querySelector('[data-testid="mode"]')?.textContent==='exploring');
    await page.waitForTimeout(700);
    const screenAfter=await map.evaluate(mapScreenPoint,original);
    assert.ok(Math.hypot(screenAfter.x-screenBefore.x,screenAfter.y-screenBefore.y)>50,
      `${engine}: a pan starting on the GPS arrow must complete the movement`);
    await recenter();
    // The first finger lands exactly on the arrow; the second joins later,
    // as on a real phone. Check a full spread and a full pinch separately.
    // Pinch out from the close driving zoom first, then spread back in. This
    // tests the full zoom range without running into the map's max zoom 19.
    for(const spread of [false,true]){
      point=await arrowCenter();
      const before=await zoom();
      const startDistance=spread?60:120;
      await touch('touchStart',[point]);
      await touch('touchStart',[point,{x:point.x+startDistance,y:point.y}]);
      for(let i=1;i<=10;i++){
        const distance=startDistance*(spread?1+i/10:1-i/20);
        await touch('touchMove',[point,{x:point.x+distance,y:point.y}]);
        await page.waitForTimeout(25);
      }
      await touch('touchEnd',[]);
      await page.waitForTimeout(900);
      const delta=(await zoom())-before;
      assert.ok(spread?delta>.65:delta<-.65,
        `${engine}: ${spread?'spread':'pinch'} starting at the arrow must complete (delta ${delta})`);
      assert.equal(await page.getByTestId('mode').textContent(),'exploring');
    }
    if(!fallback){
      const pitchBefore=Number(await map.getAttribute('data-map-pitch'));
      await page.mouse.move(80,240);await page.mouse.down({button:'right'});
      await page.mouse.move(80,330,{steps:12});await page.mouse.up({button:'right'});
      await page.waitForTimeout(700);
      assert.ok(Math.abs(Number(await map.getAttribute('data-map-pitch'))-pitchBefore)>3,
        'manual pitch must remain available while exploring');
    }
    await recenter();
    assert.equal(await zoom(),18.5,'GPS restores close zoom after both pinch directions');
    if(!fallback)assert.ok(Math.abs(Number(await map.getAttribute('data-map-pitch'))-55)<0.01,'GPS restores pitch after manual exploration');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: pan, spread and pinch from GPS arrow, with GPS during contact; native and fallback.');
}finally{await browser?.close();await vite.close();}

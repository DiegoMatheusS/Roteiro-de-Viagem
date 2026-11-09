import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';

// Real DOM/map frames catch stepping, a jumping GPS arrow, competing compass
// updates and a turn that instantly rotates instead of sweeping along the road.
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const tile=await sharp({create:{width:256,height:256,channels:4,background:'#eaf0ef'}}).png().toBuffer();
  for(const fallback of [false,true]){
    const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true,reducedMotion:'no-preference'});
    await page.addInitScript({content:`window.__name = value => value;
      window.__motionHidden=false;
      Object.defineProperty(document,'hidden',{configurable:true,get(){return window.__motionHidden;}});`});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**',route=>route.fulfill({contentType:'image/png',body:tile}));
    await page.route('**/api/traffic/status',route=>route.fulfill({json:{available:true,
      tileUrl:'http://127.0.0.1:3000/api/traffic/tiles/{style}/{z}/{x}/{y}.png',attribution:'Test',refreshSeconds:60}}));
    let firstFullTraffic=0;
    await page.route('**/api/traffic/tiles/**',route=>{
      if(route.request().url().includes('/tiles/light/')&&!firstFullTraffic)firstFullTraffic=Date.now();
      return route.fulfill({contentType:'image/png',body:tile});
    });
    await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
      {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/navigation-motion.html');
    await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
    if(fallback)await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    const engine=fallback?'leaflet-fallback':'maplibre-standalone';
    await page.locator(`[data-map-engine="${engine}"] .user-live-marker`).waitFor();
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.55,lon:-46.63,timestamp:20000,speed:10,heading:0}));
    await page.waitForTimeout(1050);
    const sampledAt=Date.now();
    const samples=await page.evaluate(async()=>{
      const api=(window as any).__navigationMotion;
      const marker=document.querySelector('.user-live-marker')!,landmark=document.querySelector('.map-destination-dot')!;
      (window as any).__originalMotionMarker=marker;
      const start=performance.now(),samples:Array<{time:number;arrowX:number;arrowY:number;landmarkY:number;heading:number}>=[];
      api.setFix({lat:-23.5499,lon:-46.63,timestamp:21000,speed:10,heading:0});
      let firstHeading=false,secondHeading=false;
      await new Promise<void>(resolve=>{
        const frame=()=>{
          const time=performance.now()-start;
          const arrow=marker.getBoundingClientRect(),destination=landmark.getBoundingClientRect();
          const heading=Number(marker.querySelector('svg')?.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]);
          samples.push({time,arrowX:arrow.x+arrow.width/2,arrowY:arrow.y+arrow.height/2,landmarkY:destination.y+destination.height/2,heading});
          if(time>300&&!firstHeading){
            firstHeading=true;api.setHeading(90);
            (document.querySelector('button[aria-label="Mostrar trânsito"]') as HTMLButtonElement)?.click();
          }
          if(time>600&&!secondHeading){secondHeading=true;api.setHeading(310);}
          if(time<1250)requestAnimationFrame(frame);else resolve();
        };requestAnimationFrame(frame);
      });
      return samples;
    });
    const early=samples.find(sample=>sample.time>250)!,late=samples.find(sample=>sample.time>850)!;
    assert.ok(samples.length>15,`${engine}: enough real frames (${samples.length})`);
    assert.ok(Math.abs(late.landmarkY-early.landmarkY)>7,`${engine}: camera keeps moving after the old 210 ms window`);
    const first=samples[0];
    const arrowDrift=Math.max(...samples.map(sample=>Math.hypot(sample.arrowX-first.arrowX,sample.arrowY-first.arrowY)));
    assert.ok(arrowDrift<10,`${engine}: arrow and camera must move together (drift ${arrowDrift.toFixed(2)} px)`);
    assert.ok(samples.every(sample=>Math.abs(sample.heading)<.1),`${engine}: phone compass cannot turn the driving arrow away from the street`);
    assert.ok(firstFullTraffic>sampledAt&&firstFullTraffic-sampledAt<900,
      `${engine}: traffic must update during GPS follow, without waiting for moveend (${firstFullTraffic-sampledAt} ms)`);
    assert.equal(await page.getByTestId('raw-latitude').textContent(),'-23.5499','interpolation never rewrites the real GPS fix');
    assert.equal(await page.locator('.user-live-marker').evaluate(element=>element===(window as any).__originalMotionMarker),true);
    // Position and road bearing share the same clock through a real 90° turn.
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.54964,lon:-46.63,timestamp:22000,speed:10,heading:0}));
    await page.waitForTimeout(1100);
    const angles=await page.evaluate(async()=>{
      const api=(window as any).__navigationMotion;const start=performance.now(),angles:number[]=[];
      api.setFix({lat:-23.5496,lon:-46.6299,timestamp:23000,speed:10,heading:90});
      await new Promise<void>(resolve=>{
        const frame=()=>{
          angles.push(Number(document.querySelector<SVGElement>('.user-live-marker svg')?.style.transform.match(/rotate\(([-.\d]+)deg\)/)?.[1]));
          if(performance.now()-start<1200)requestAnimationFrame(frame);else resolve();
        };requestAnimationFrame(frame);
      });return angles;
    });
    assert.ok(angles.some(angle=>angle>10&&angle<80),`${engine}: arrow sweeps through intermediate turn angles`);
    assert.ok(Math.abs(angles.at(-1)!-90)<.1,`${engine}: arrow ends aligned to the new street`);
    // Stop jitter and loss during an animation must not drag the viewport.
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.5496,lon:-46.6299,timestamp:24000,speed:0,heading:240}));
    await page.waitForTimeout(1100);
    const stopped=await page.locator('.map-destination-dot').boundingBox();assert.ok(stopped);
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.54957,lon:-46.6299,timestamp:25000,speed:0,heading:270}));
    await page.waitForTimeout(1100);
    const jitter=await page.locator('.map-destination-dot').boundingBox();assert.ok(jitter);
    assert.ok(Math.hypot(stopped.x-jitter.x,stopped.y-jitter.y)<1,`${engine}: stationary noise is suppressed`);
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.5496,lon:-46.6298,timestamp:26000,speed:10,heading:90}));
    await page.waitForTimeout(300);
    await page.evaluate(()=>{(window as any).__motionHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(100);
    const background=await page.locator('.map-destination-dot').boundingBox();assert.ok(background);
    await page.waitForTimeout(600);
    const still=await page.locator('.map-destination-dot').boundingBox();assert.ok(still);
    assert.ok(Math.hypot(background.x-still.x,background.y-still.y)<1,`${engine}: background stops the old trajectory`);
    await page.evaluate(()=>{
      (window as any).__motionHidden=false;document.dispatchEvent(new Event('visibilitychange'));
      (window as any).__navigationMotion.setFix({lat:-23.5496,lon:-46.6298,timestamp:27000,speed:10,heading:90});
    });
    await page.waitForTimeout(150);
    const resumed=await page.locator('.map-destination-dot').boundingBox();assert.ok(resumed);
    assert.ok(Math.hypot(resumed.x-background.x,resumed.y-background.y)>2,
      `${engine}: a fresh fix at the same coordinates resumes following after background`);
    await page.evaluate(()=>(window as any).__navigationMotion.setFix({lat:-23.5496,lon:-46.6297,timestamp:28000,speed:10,heading:90}));
    await page.waitForTimeout(300);await page.evaluate(()=>(window as any).__navigationMotion.setLost(true));await page.waitForTimeout(100);
    assert.equal(await page.locator('.user-live-marker').getAttribute('data-gps-state'),'stale');
    const held=await page.locator('.map-destination-dot').boundingBox();assert.ok(held);await page.waitForTimeout(600);
    const after=await page.locator('.map-destination-dot').boundingBox();assert.ok(after);
    assert.ok(Math.hypot(held.x-after.x,held.y-after.y)<1,`${engine}: loss stops the in-flight camera`);
    await page.evaluate(()=>(window as any).__navigationMotion.setShow(false));await page.locator('.user-live-marker').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${engine} smooth GPS/camera, road direction, gradual turns, stop/loss/disposal (${samples.length} frames; drift ${arrowDrift.toFixed(2)} px).`);
    await page.close();
  }
}finally{await browser?.close();await vite.close();}

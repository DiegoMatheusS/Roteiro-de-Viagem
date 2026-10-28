import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const tile=await sharp({create:{width:256,height:256,channels:4,background:'#eaf0ef'}}).png().toBuffer();
  for(const fallback of [false,true]){
    const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      (window as any).__gpsWatchCount=0;(window as any).__gpsPageHidden=false;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>(window as any).__gpsPageHidden});
      Object.defineProperty(navigator,'geolocation',{value:{
        watchPosition(success:Function,error:Function){
          (window as any).__gpsWatchCount++;
          (window as any).__gpsFix=success;(window as any).__gpsError=error;
          return 1;
        },clearWatch(){(window as any).__gpsWatchCount--;}
      }});
    });
    await page.route('https://**',route=>route.fulfill({contentType:'image/png',body:tile}));
    await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
      {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/navigation-gps-state.html');
    await page.waitForFunction(()=>typeof (window as any).__gpsFix==='function');
    const receive=async(age=0,lat=-23.55)=>page.evaluate(({age,lat})=>(window as any).__gpsFix({
      coords:{latitude:lat,longitude:-46.63,accuracy:6,speed:8,heading:90},timestamp:Date.now()-age
    }),{age,lat});
    await receive();
    await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
    if(fallback)await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    const engine=fallback?'leaflet-fallback':'maplibre-standalone';
    const map=page.locator(`[data-map-engine="${engine}"]`);
    const marker=page.locator('.user-live-marker');
    await marker.waitFor();await page.waitForTimeout(700);
    assert.equal(await marker.getAttribute('data-gps-state'),'live');
    const arrowStyle=await marker.evaluate(element=>{
      const visual=element.tagName==='BUTTON'?element:element.firstElementChild!;
      const style=getComputedStyle(visual);
      return {background:style.backgroundColor,border:style.borderTopWidth};
    });
    assert.equal(arrowStyle.background,'rgba(0, 0, 0, 0)','the GPS arrow has no circular background');
    assert.equal(arrowStyle.border,'0px');
    await marker.evaluate(element=>(window as any).__originalGpsMarker=element);
    const center=await map.getAttribute('data-map-center');
    await receive(6_001,-23.7);
    await page.waitForFunction(()=>document.querySelector('.user-live-marker')?.getAttribute('data-gps-state')==='stale');
    assert.equal(await map.getAttribute('data-map-center'),center,'stale coordinates must never move the camera');
    assert.equal(await page.getByTestId('speed').textContent(),'unknown','stale speed is not live speed');
    assert.equal(await page.getByRole('button',{name:'GPS',exact:true}).isDisabled(),true);
    await page.evaluate(()=>(window as any).__gpsError({code:2}));
    await page.waitForFunction(()=>document.querySelector('[data-testid="gps-status"]')?.textContent==='error');
    assert.equal(await marker.evaluate(element=>element===(window as any).__originalGpsMarker),true,'transient GPS errors keep the same DOM arrow');
    await receive(0,-23.549);
    await page.waitForFunction(()=>document.querySelector('.user-live-marker')?.getAttribute('data-gps-state')==='live');
    assert.equal(await marker.evaluate(element=>element===(window as any).__originalGpsMarker),true,'recovery moves the existing arrow');
    assert.equal(await page.getByTestId('speed').textContent(),'29');
    await page.evaluate(()=>{
      (window as any).__oldGpsCallback=(window as any).__gpsFix;
      (window as any).__gpsPageHidden=true;document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(()=>(window as any).__gpsWatchCount),0,'a hidden page must release its foreground GPS watch');
    await page.evaluate(()=>(window as any).__oldGpsCallback({coords:{latitude:-23.8,longitude:-46.63,accuracy:6,speed:8,heading:90},timestamp:Date.now()}));
    await page.evaluate(()=>{(window as any).__gpsPageHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>(window as any).__gpsWatchCount),1,'resume starts one watch');
    await receive(0,-23.549);
    assert.equal(await marker.evaluate(element=>element===(window as any).__originalGpsMarker),true,'background/resume preserves the arrow');
    await page.getByRole('button',{name:'Outra viagem',exact:true}).click();
    await marker.waitFor({state:'detached'});
    assert.equal(await page.getByRole('button',{name:'GPS',exact:true}).isDisabled(),true,'another trip must not inherit a previous fix');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: GPS loss keeps the same stale arrow; fresh speed/camera resume only with a fresh fix; trip change clears it, native and fallback.');
}finally{await browser?.close();await vite.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {poiDensity} from '../src/services/poiDensity';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
fs.mkdirSync('test-results',{recursive:true});
try{
 for(const raster of [false,true])for(const navigation of [false,true]){
  const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true,isMobile:true});page.setDefaultTimeout(15000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{average:null,count:0,prices:[]}}));
  await page.goto(`http://127.0.0.1:3000/tests/fixtures/poi-density.html?${raster?'raster=1&':''}${navigation?'navigation=1':''}`);
  await page.waitForFunction(()=>!!(window as any).__poiDensity);
  const setView=async(zoom:number,bearing=0,pitch=0)=>{
    await page.evaluate(async({zoom,bearing,pitch})=>{
      (window as any).__poiDensity.setView(zoom,bearing,pitch);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    },{zoom,bearing,pitch});
  };
  let farCount=0;
  for(const zoom of [9,11,14,16,18]){
    await setView(zoom);
    const shown=await page.evaluate(()=>(window as any).__poiDensity.stats());
    const layout=poiDensity(zoom,420,850);
    assert.ok(shown.length>0&&shown.length<=layout.limit,`${raster?'raster':'native'}: ${shown.length} pins at zoom ${zoom}`);
    if(zoom===11)farCount=shown.length;
    if(zoom===18)assert.ok(shown.length>farCount,'approaching reveals more of the dense neighbourhood');
    for(let i=0;i<shown.length;i++){
      assert.ok(shown[i].error<1.25,'visible icons remain on their real coordinates');
      assert.ok(Math.abs(shown[i].width-layout.size)<.1);
      for(let j=i+1;j<shown.length;j++)assert.ok(Math.hypot(shown[i].x-shown[j].x,shown[i].y-shown[j].y)>=layout.gap-1.5,'icons have clear space between them');
    }
  }
  if(!raster){
    await setView(16,125,55);
    const shown=await page.evaluate(()=>(window as any).__poiDensity.stats());
    assert.ok(shown.length<=poiDensity(16,420,850).limit);assert.ok(shown.every((pin:any)=>pin.error<1.25));
  }
  await setView(17);
  const cdp=await page.context().newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd',points:{x:number;y:number}[])=>cdp.send('Input.dispatchTouchEvent',{
    type,touchPoints:points.map((point,id)=>({...point,id,radiusX:4,radiusY:4,force:1}))});
  const icon=async()=>{
    const points=await page.evaluate(()=>(window as any).__poiDensity.stats());
    const point=points.find((pin:any)=>pin.x>70&&pin.x<270&&pin.y>100&&pin.y<700);assert.ok(point);return {x:point.x,y:point.y};
  };
  let point=await icon();const before=await page.evaluate(()=>JSON.stringify((window as any).__poiDensity.center()));
  await touch('touchStart',[point]);
  for(let step=1;step<=10;step++){await touch('touchMove',[{x:point.x+step*8,y:point.y+step*3}]);await page.waitForTimeout(25);}
  await touch('touchEnd',[]);await page.waitForTimeout(500);
  assert.notEqual(await page.evaluate(()=>JSON.stringify((window as any).__poiDensity.center())),before,'pan starting on a POI moves the map');
  assert.equal(await page.locator('.role-place-balloon').count(),0,'drag must not open a balloon');
  await setView(17);
  for(const spread of [true,false]){
    point=await icon();const zoom=await page.evaluate(()=>(window as any).__poiDensity.zoom());
    const distance=spread?60:120;
    await touch('touchStart',[point]);await touch('touchStart',[point,{x:point.x+distance,y:point.y}]);
    for(let step=1;step<=10;step++){
      await touch('touchMove',[point,{x:point.x+distance*(spread?1+step/10:1-step/20),y:point.y}]);
      await page.waitForTimeout(25);
    }
    await touch('touchEnd',[]);await page.waitForTimeout(600);
    const change=(await page.evaluate(()=>(window as any).__poiDensity.zoom()))-zoom;
    assert.ok(spread?change>.65:change<-.65,`pinch from a POI completes (${change})`);
    assert.equal(await page.locator('.role-place-balloon').count(),0);
  }
  point=await icon();await page.touchscreen.tap(point.x,point.y);
  await page.locator('.role-place-balloon').waitFor();
  assert.equal(await page.evaluate(()=>(window as any).__poiDensity.selectedCoordinates()),0,'a tap on the POI does not choose a map destination');
  await setView(11);
  await page.locator('.role-place-balloon').waitFor();
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`test-results/poi-density-${raster?'raster':'native'}-${navigation?'navigation':'home'}.png`});
  await page.close();
 }
 console.log('POI density: 500 points, overview/detail, tilt/rotation, pan and both pinch directions from icons, single-tap balloon in both engines.');
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){
 console.error(await page.evaluate(()=>({text:document.body.innerText,stats:(window as any).__poiDensity?.stats()})).catch(()=>null));
 await page.screenshot({path:'test-results/poi-density-failure.png'}).catch(()=>{});
}throw error;}finally{await browser.close();await vite.close();}

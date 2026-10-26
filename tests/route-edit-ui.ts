import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mapScreenPoint} from './helpers/map-screen-point';
const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
      '--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const fallback of [false,true]){
    const page=await browser.newPage({viewport:{width:420,height:850}});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**',route=>route.abort());
    if(!fallback)await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{
      version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]
    }}));
    let requests=0,failNext=false;
    await page.route('**/api/routes/adjust',route=>{
      requests++;
      if(failNext)return route.fulfill({status:503,json:{error:'Falha de rota no teste'}});
      const {waypoints}=route.request().postDataJSON() as {waypoints:[number,number][]};
      return route.fulfill({json:{routePath:waypoints,routeSteps:[],distanceKm:2,
        drivingMinutes:12,routingSource:'OSRM',stale:false}});
    });
    await page.goto('http://127.0.0.1:3000/tests/fixtures/route-edit.html');
    await page.getByRole('button',{name:'Expandir mapa',exact:true}).click();
    const engine=fallback?'leaflet-fallback':'maplibre-standalone';
    const map=page.locator(`[data-map-engine="${engine}"]`);
    await map.waitFor();
    await page.waitForFunction(engine=>Boolean(document.querySelector<HTMLElement>(
      `[data-map-engine="${engine}"]`)?.dataset.mapCenter),engine);
    if(!fallback)await page.waitForFunction(()=>document.querySelector<HTMLElement>(
      '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
    else await page.waitForFunction(()=>document.querySelectorAll('.leaflet-overlay-pane path').length>0);
    const handle=page.locator('.role-route-edit-marker');
    assert.equal(await handle.count(),0,'no automatic midpoint, arrows or handle before a line tap');
    const outside=await map.evaluate(mapScreenPoint,[-23.55,-46.62] as [number,number]);
    await page.mouse.click(outside.x,outside.y);
    assert.equal(await handle.count(),0,'a tap outside the road cannot create a waypoint');
    const select=await map.evaluate(mapScreenPoint,[-23.555,-46.625] as [number,number]);
    await page.mouse.click(select.x,select.y);
    await handle.waitFor();
    assert.equal(requests,0,'selecting a line only creates the handle, without recalculating');
    assert.equal(await handle.textContent(),'','the edit handle is a dot without arrow text');
    const box=await handle.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+25,{steps:10});
    await page.mouse.up();
    await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="route-path"]')!.textContent!)[1][0]!==-23.555,undefined,{timeout:5000}).catch(async error=>{
      console.log('EDIT DEBUG',{fallback,requests,path:await page.getByTestId('route-path').textContent(),
        error:await page.getByTestId('edit-error').textContent(),marker:await handle.evaluateAll(items=>items.map(item=>item.getAttribute('style')))});
      await page.screenshot({path:'test-results/route-edit-debug.png'});
      throw error;
    });
    assert.equal(requests,1,'only dropping the dot requests a road-routing result');
    await handle.waitFor({state:'detached'});
    if(!fallback)await page.waitForFunction(()=>document.querySelector<HTMLElement>(
      '[data-map-engine="maplibre-standalone"]')?.dataset.mapIdle==='true');
    const confirmed=await page.getByTestId('route-path').textContent();
    const point=JSON.parse(confirmed!)[1] as [number,number];
    const second=await map.evaluate(mapScreenPoint,point);
    await page.mouse.click(second.x,second.y);
    await handle.waitFor();
    failNext=true;
    const retry=await handle.boundingBox();assert.ok(retry);
    await page.mouse.move(retry.x+retry.width/2,retry.y+retry.height/2);
    await page.mouse.down();
    await page.mouse.move(retry.x+retry.width/2-45,retry.y+retry.height/2+25,{steps:10});
    await page.mouse.up();
    await page.waitForFunction(()=>Boolean(document.querySelector('[data-testid="edit-error"]')?.textContent));
    assert.equal(await page.getByTestId('route-path').textContent(),confirmed,
      'a failed recalculation preserves the verified previous route');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: tap route → dot → drag → verified recalculation; native and raster fallback.');
}finally{await browser?.close();await vite.close();}

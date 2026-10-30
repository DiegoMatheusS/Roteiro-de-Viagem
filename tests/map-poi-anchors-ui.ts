import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:420,height:850}});
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
const checkAnchors=async()=>{
  const pins=await page.evaluate(()=>{
    const {map,entries}=(window as any).__poiAnchors;
    const bounds=map.getContainer().getBoundingClientRect();
    return entries.map((entry:any)=>{
      const pin=document.querySelector<HTMLElement>(`[data-poi-id="${entry.id}"]`)!;
      const rect=pin.querySelector('.rdv-map-place-icon')!.getBoundingClientRect();
      const expected=map.project([entry.coords[1],entry.coords[0]]);
      return {id:entry.id,position:getComputedStyle(pin).position,text:pin.textContent?.trim(),
        title:pin.getAttribute('title'),halo:getComputedStyle(pin,'::before').content,
        width:rect.width,height:rect.height,
        error:Math.hypot(rect.x+rect.width/2-bounds.x-expected.x,rect.y+rect.height/2-bounds.y-expected.y)};
    });
  });
  for(const pin of pins){
    assert.equal(pin.position,'absolute',pin.id);
    assert.ok(pin.error<1.25,`${pin.id} drifted ${pin.error.toFixed(2)} px from its coordinate`);
    assert.equal(pin.width,38);assert.equal(pin.height,38);
    assert.equal(pin.text,'','map pins contain only a category symbol');
    assert.equal(pin.title,null,'no name tooltip is rendered over the map');
    assert.equal(pin.halo,'none','no promotional halo');
  }
};
try{
  await page.goto('http://127.0.0.1:3000/tests/fixtures/poi-anchors.html');
  await page.waitForFunction(()=>Boolean((window as any).__poiAnchors));
  for(const view of [{zoom:17,pitch:0,bearing:0},{zoom:12,pitch:0,bearing:0},
    {zoom:18,pitch:55,bearing:0},{zoom:16,pitch:50,bearing:120},
    {zoom:19,pitch:60,bearing:270},{zoom:9,pitch:0,bearing:0}]){
    await page.evaluate(async view=>{
      (window as any).__poiAnchors.map.jumpTo(view);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    },view);
    await checkAnchors();
  }
  const preserved=await page.evaluate(()=>{
    const fixture=(window as any).__poiAnchors;
    const fuel=document.querySelector('[data-poi-id="admin:fuel"]');
    fixture.entries=fixture.entries.filter((entry:any)=>entry.id!=='admin:park').map((entry:any)=>
      entry.id==='admin:fuel'?{...entry,priceLabel:'R$ 6,10',coords:[-23.55025,-46.63015]}:entry);
    fixture.entries.push({kind:'place',id:'admin:museum',name:'Museu do teste',category:'museum',
      coords:[-23.55,-46.63],managed:true});
    fixture.controller.update(fixture.entries);
    return document.querySelector('[data-poi-id="admin:fuel"]')===fuel;
  });
  assert.equal(preserved,true,'price and coordinate updates preserve the marker');
  await checkAnchors();
  await page.evaluate(()=>{
    (window as any).__poiAnchors.map.jumpTo({zoom:17,pitch:50,bearing:40});
  });
  const before=await page.evaluate(()=>(window as any).__poiAnchors.map.getCenter().toArray());
  await page.mouse.move(320,100);await page.mouse.down();
  await page.mouse.move(280,170,{steps:8});
  await page.waitForTimeout(150); // Stop gesture velocity before release.
  await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const after=await page.evaluate(()=>(window as any).__poiAnchors.map.getCenter().toArray());
  assert.notDeepEqual(after,before,'the map was actually dragged');
  await checkAnchors();
  await page.getByRole('button',{name:'Ver Posto do teste',exact:true}).press('Enter');
  await page.getByRole('region',{name:'Detalhes de Posto do teste'}).getByRole('button',{name:'Indicar preço',exact:true}).click();
  await page.getByRole('button',{name:'Ver Museu do teste',exact:true}).press('Space');
  await page.getByRole('region',{name:'Detalhes de Museu do teste'}).getByRole('button',{name:'Ver detalhes',exact:true}).click();
  const actions=await page.evaluate(()=>(window as any).__poiAnchors.actions);
  assert.equal(actions[0].kind,'fuel');assert.equal(actions[0].section,'prices');
  assert.equal(actions[1].kind,'place');assert.equal(actions[1].id,'admin:museum');
  await checkAnchors();
  assert.deepEqual(errors,[]);
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/poi-anchors.png'});
  console.log('POI anchors: fixed coordinates through zoom, rotation, pitch, updates and removal; symbols only and details on activation.');
}finally{await browser.close();await vite.close();}

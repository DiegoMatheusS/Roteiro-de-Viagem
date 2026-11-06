import assert from 'node:assert/strict';
import fs from 'node:fs';
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
    const page=await browser.newPage({viewport:{width:fallback?360:402,height:fallback?740:874},hasTouch:true,reducedMotion:'reduce'});
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'geolocation',{value:{
        watchPosition(success:Function){
          let latest:any;
          (window as any).__exploreGps=(fix:any)=>{latest=fix;success(fix);};
          return window.setInterval(()=>{if(latest)success({...latest,timestamp:Date.now()});},1000);
        },clearWatch(id:number){window.clearInterval(id);}
      }});
    });
    await page.route(/^https:\/\//,route=>route.fulfill({contentType:'image/png',body:tile}));
    await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
      {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
    await page.route('**/api/**',route=>route.fulfill({json:{available:false,places:[],stations:[],items:[]}}));
    await page.route('**/api/places/search',route=>route.fulfill({json:{places:[
      {id:'admin:explore-park',name:'Parque do teste Explorar',kind:'park',lat:-23.54,lng:-46.61,address:'Endereço do teste',description:'',website:'',phone:'',active:true},
      {id:'admin:explore-museum',name:'Museu do teste Explorar',kind:'museum',lat:-23.56,lng:-46.65,address:'Endereço do teste',description:'',website:'',phone:'',active:true},
      ...Array.from({length:12},(_,i)=>({id:`admin:cafe-${i}`,name:`Café do teste ${i}`,kind:'cafe',lat:-23.55+i*.0001,lng:-46.63+i*.0001,address:'São Paulo, SP',description:'',website:'',phone:'',active:true}))
    ]}}));
    let photoRequests=0;
    await page.route('**/api/places/photos',route=>{
      photoRequests++;
      const {ids}=route.request().postDataJSON();
      return route.fulfill({json:{photos:Object.fromEntries(ids.map((id:string)=>[id,id==='admin:cafe-0'||id==='admin:explore-park'?{
        photo:'https://upload.wikimedia.org/fixture-photo.png',photoPage:'https://commons.wikimedia.org/wiki/File:Teste.jpg',photoCredit:'Autor do teste · CC BY-SA 4.0'
      }:id==='admin:explore-museum'?{photo:'https://upload.wikimedia.org/broken.jpg',photoPage:'https://commons.wikimedia.org/wiki/File:Missing.jpg',photoCredit:'Autor do teste · CC BY-SA 4.0'}:null]))}});
    });
    await page.route('https://upload.wikimedia.org/broken.jpg',route=>route.fulfill({status:404,body:''}));
    await page.goto('http://127.0.0.1:3000/tests/fixtures/explore-panel.html');
    const region=page.getByRole('region',{name:'Explorar passeios'});
    const sheet=region.locator('.rdv-explore-sheet');
    const toggle=region.locator('.rdv-explore-sheet-toggle');
    const map=page.locator(`[data-map-engine="${fallback?'leaflet-fallback':'maplibre-standalone'}"]`);
    await page.waitForFunction(()=>document.querySelector('[data-map-engine="maplibre-standalone"]')?.getAttribute('data-map-ready')==='true');
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#rdv-explore-results').isVisible(),false);
    if(fallback)await page.locator('.maplibregl-canvas').evaluate(canvas=>canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await map.waitFor();
    await page.waitForFunction(()=>typeof (window as any).__exploreGps==='function');
    const fix=async(lat=-23.55,lng=-46.63)=>page.evaluate(({lat,lng})=>(window as any).__exploreGps({
      coords:{latitude:lat,longitude:lng,accuracy:6,speed:0,heading:null},timestamp:Date.now()
    }),{lat,lng});
    await fix();
    const centered=async()=>page.waitForFunction(engine=>{
      const map=document.querySelector<HTMLElement>(`[data-map-engine="${engine}"]`);
      const center=JSON.parse(map?.dataset.mapCenter||'[0,0]');
      // Leaflet rounds pixel offsets on resize; at city zoom one pixel spans tens of metres.
      const tolerance=engine==='leaflet-fallback'?0.0005:0.00001;
      return Math.abs(center[0]+23.55)<tolerance&&Math.abs(center[1]+46.63)<tolerance&&Number(map?.dataset.mapZoom)===12.5;
    },fallback?'leaflet-fallback':'maplibre-standalone');
    await centered();
    assert.equal(photoRequests,0,'o painel fechado não carrega fotografias fora de vista');
    await page.locator('[data-poi-id="admin:cafe-0"]:visible').first().waitFor();
    assert.equal(await page.locator('[data-poi-id^="admin:cafe-"]:visible').count(),12,'Explorar mantém todos os ícones vizinhos, sem suprimir colisões');
    const pin=page.locator('.managed-place-marker[aria-label="Ver Parque do teste Explorar"]:visible').first();
    await pin.waitFor({state:'visible'});
    const pinBox=await pin.boundingBox(),collapsedBox=await sheet.boundingBox();
    assert.ok(pinBox&&collapsedBox&&pinBox.y+pinBox.height<collapsedBox.y,'o painel recolhido deixa os ícones acessíveis');
    const largeMap=(await region.locator('.rdv-explore-map').boundingBox())!.height;
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await region.locator('.rdv-explore-route-row').first().waitFor({state:'visible'});
    const cafePhoto=region.getByRole('img',{name:'Fotografia de Café do teste 0',exact:true});
    await cafePhoto.waitFor();
    await cafePhoto.evaluate(el=>(el as HTMLImageElement).decode());
    assert.ok(await cafePhoto.evaluate(el=>(el as HTMLImageElement).naturalWidth>0));
    await region.locator('.rdv-explore-photo-credit').first().waitFor();
    await region.getByRole('button',{name:'Estabelecimentos',exact:true}).click();
    await region.getByRole('heading',{name:'Estabelecimentos',exact:true}).waitFor();
    assert.equal(await region.getByRole('heading',{name:/^Café do teste \d+$/}).count(),12,'estabelecimentos cadastrados também aparecem nos cartões');
    assert.equal(await region.getByRole('heading',{name:'Parque do teste Explorar',exact:true}).count(),0);
    await region.getByRole('button',{name:'Todos',exact:true}).click();
    const brokenImage=page.waitForResponse('https://upload.wikimedia.org/broken.jpg');
    await region.getByRole('searchbox',{name:'Buscar passeios'}).fill('Museu do teste Explorar');
    const missingPhoto=region.locator('article').filter({has:page.getByRole('heading',{name:'Museu do teste Explorar',exact:true})});
    await missingPhoto.scrollIntoViewIfNeeded();
    await brokenImage;
    await missingPhoto.getByText('Foto indisponível',{exact:true}).waitFor();
    assert.equal(await missingPhoto.locator('img').count(),0,'uma imagem que falhou mantém a categoria e a indicação de foto indisponível');
    await region.getByRole('searchbox',{name:'Buscar passeios'}).fill('');
    await page.waitForTimeout(250);
    const smallMap=(await region.locator('.rdv-explore-map').boundingBox())!.height;
    assert.ok(largeMap>smallMap+140,'recolher aumenta a área real do mapa');
    await centered();
    const list=page.locator('.rdv-explore-list');
    await list.evaluate(el=>{el.scrollTop=120;});
    assert.ok(await list.evaluate(el=>el.scrollTop)>0,'a lista expandida continua rolável');
    const cdp=await page.context().newCDPSession(page);
    async function swipe(delta:number){
      const box=(await toggle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=5;i++){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+delta*i/5}]});
        await page.waitForTimeout(25);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(250);
    }
    await swipe(110);
    assert.equal(await toggle.getAttribute('aria-expanded'),'false','deslizar para baixo recolhe sem o clique reabrir');
    await swipe(-110);
    assert.equal(await toggle.getAttribute('aria-expanded'),'true','deslizar para cima abre a lista');
    await toggle.click();
    await page.waitForTimeout(250);
    const area=(await region.locator('.rdv-explore-map').boundingBox())!;
    await page.mouse.move(area.x+area.width/2,area.y+area.height/2);
    await page.mouse.down();await page.mouse.move(area.x+area.width/2+70,area.y+area.height/2+35,{steps:12});await page.mouse.up();
    await page.waitForTimeout(1200);
    const explored=await map.getAttribute('data-map-center');
    await fix(-23.551,-46.631);await page.waitForTimeout(350);
    assert.equal(await map.getAttribute('data-map-center'),explored,'leituras de GPS não roubam a câmera explorada');
    await fix();
    await region.getByRole('button',{name:'Centralizar nas redondezas do GPS'}).click();
    await centered();
    await toggle.focus();await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true','o puxador funciona pelo teclado');
    await toggle.click();
    await region.getByRole('searchbox',{name:'Buscar passeios'}).fill('Ibirapuera');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true','a busca abre os resultados');
    await region.getByRole('heading',{name:'Parque Ibirapuera',exact:true}).waitFor();
    await toggle.click();await page.waitForTimeout(250);
    await pin.waitFor({state:'visible'});
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:`test-results/explore-panel-${fallback?'fallback':'native'}.png`});
    assert.deepEqual(errors,[]);await cdp.detach();await page.close();
  }
  console.log('PASS: Explorar abre com mais mapa; painel por toque, gesto e teclado; ícones acessíveis e GPS em zoom 12.5 sem interromper exploração, nativo e fallback.');
}finally{await browser?.close();await vite.close();}

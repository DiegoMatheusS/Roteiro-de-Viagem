import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const vite=await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:420,height:850},hasTouch:true,isMobile:true});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[
    {id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]}}));
  await page.route('**/api/**',route=>route.fulfill({json:{stations:[],places:[],options:[]}}));
  const queries:string[]=[];
  let mode:'error'|'empty'|'success'='error';
  await page.route('**/api/locations/search?**',async route=>{
    queries.push(new URL(route.request().url()).searchParams.get('q')!);
    await route.fulfill(mode==='error'?{status:503,json:{error:'Busca indisponível. Tente novamente.'}}:
      {json:{results:mode==='empty'?[]:[{id:'osm:way:1',name:'Rua de teste',address:'Cidade de teste',coords:[-23.54,-46.62]}]}});
  });
  await page.goto('http://127.0.0.1:3000/tests/fixtures/navigation-home-search.html');
  const input=page.getByRole('searchbox',{name:'Para onde quer ir?'});
  const submit=page.getByRole('button',{name:'Pesquisar destino',exact:true});
  await input.fill('Rua de teste');
  await submit.tap();
  const alert=page.getByRole('alert').filter({hasText:'Busca indisponível'});
  await alert.waitFor();
  assert.equal(await alert.evaluate(element=>{
    const r=element.getBoundingClientRect();
    const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!top&&(top===element||element.contains(top));
  }),true,'search failures must appear above the full-screen map, inside the viewport');
  mode='empty';
  await input.press('Enter');
  await page.getByRole('alert').filter({hasText:'Nenhum destino encontrado'}).waitFor();
  mode='success';
  await submit.tap();
  await page.getByRole('region',{name:'Destino no mapa'}).getByRole('heading',{name:'Rua de teste'}).waitFor();
  assert.deepEqual(queries,['Rua de teste','Rua de teste','Rua de teste'],'one request per tap or keyboard submit');
  assert.equal(await input.evaluate(element=>document.activeElement===element),false,'close the keyboard after locating the address');
  assert.deepEqual(errors,[]);
  console.log('PASS: address search by touch and Enter, visible failure/empty states, retry opens the destination.');
}finally{await browser?.close();await vite.close();}

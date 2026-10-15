import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { createServer } from 'vite';
import sharp from 'sharp';
import { openDatabase } from '../server/db';
import { createApi } from '../server/app';
import { createRoadDraft } from '../src/services/touristCircuit';
import type { Vehicle } from '../src/types';

// Synthetic coordinates and provider responses are confined to this test.
const routePath: [number, number][] = [[0,0],[0,0.01],[0,0.02],[0,0.01],[0,0]];
const vehicle: Vehicle = { id:'test-car',type:'car',brand:'Teste',model:'Veículo de teste',nickname:'Carro',year:2026,fuelType:'gasolina',tankCapacityLiters:50,maxPassengers:5,odometerKm:0,consumption:{referenceUrban:10,referenceHighway:15,referenceAverage:12,userConfigured:12,source:'teste',sourceDate:'2026'} };
const trip = { ...createRoadDraft({originName:'Origem do teste',originCoords:routePath[0],destinationName:'Origem do teste',destinationCoords:routePath[4],vehicle,circular:true,limits:{mode:'destination'}}),routePath,routingSource:'OSRM' as const,distanceKm:4.448,durationMinutes:120,drivingMinutes:120,vehicleGroupType:'multi_vehicle' as const,groupVehiclesCount:2,peopleCount:4,splitExpenses:true,estimatedFuelCost:30,totalFoodCost:40,totalEstimatedCost:70,costPerPerson:17.5 };
const mapFetch: typeof fetch = async () => new Response(JSON.stringify({elements:[
  {type:'node',id:821,lat:0,lon:0.01,tags:{barrier:'toll_booth',name:'Praça da interface'}},
  {type:'node',id:822,lat:0.0001,lon:0.01,tags:{barrier:'toll_booth',name:'Faixa vizinha'}}
]}));
const weatherFetch: typeof fetch = async input => {
  const points = new URL(String(input)).searchParams.get('latitude')!.split(',');
  const time = Array.from({length:384},(_,i) => new Date(Math.floor(Date.now()/3600000)*3600000+i*3600000).toISOString().slice(0,19));
  return new Response(JSON.stringify(points.map((_,index) => ({hourly_units:{temperature_2m:'°C',wind_speed_10m:'km/h'},hourly:{time,temperature_2m:time.map(()=>24),precipitation_probability:time.map(()=>index?80:10),weather_code:time.map(()=>index?61:0),wind_speed_10m:time.map(()=>15)}}))));
};
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'rdv-part3-ui-'));
const db = openDatabase(':memory:');
const server = createApi({db,mapFetch,weatherFetch,photoDirectory:path.join(directory,'photos')}).listen(3001,'127.0.0.1');
await new Promise<void>(resolve => server.once('listening',resolve));
const vite = await createServer({server:{host:'127.0.0.1',port:3000,strictPort:true}});
await vite.listen();
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']:[]});
const context = await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:0,longitude:0,accuracy:3}});
const adminContext = await browser.newContext({viewport:{width:1365,height:900}});
const page = await context.newPage(), admin = await adminContext.newPage();
page.setDefaultTimeout(15000);admin.setDefaultTimeout(15000);
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));admin.on('pageerror',error=>errors.push(error.message));
const register = async(email:string) => {
  const res = await fetch('http://127.0.0.1:3001/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,displayName:'Viajante de teste',password:'test-password-long'})});
  assert.equal(res.status,201);
  return {user:(await res.json() as any).user,cookie:res.headers.get('set-cookie')!.split(';')[0]};
};
const login = async(target:BrowserContext,cookie:string) => {
  const separator=cookie.indexOf('=');
  await target.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),domain:'127.0.0.1',path:'/api',httpOnly:true,sameSite:'Lax'}]);
};
fs.mkdirSync('test-results',{recursive:true});
try {
  const traveler=await register('part3-ui@example.test'), moderator=await register('part3-admin@example.test');
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(moderator.user.id);
  const saved=await fetch('http://127.0.0.1:3001/api/me/state',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:traveler.cookie},body:JSON.stringify({revision:0,state:{profile:{id:traveler.user.id,name:'Viajante de teste',verifiedGpsKm:0,manualKm:0,completedTripsCount:0,savedRoutesCount:1,publishedRoutesCount:0,reviewsCount:0,isPublicProfile:false,showLevelPublicly:false,showMedalsPublicly:false,showKmPublicly:false,emergencyContacts:[]},vehicles:[vehicle],fuelLogs:[],achievements:[],trips:[trip],activeTrip:null,selectedVehicleId:vehicle.id,convoys:[],activeConvoyId:null}})});
  assert.equal(saved.status,200);
  await login(context,traveler.cookie);await login(adminContext,moderator.cookie);
  await page.route('https://**',route=>route.abort());await admin.route('https://**',route=>route.abort());
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button',{name:'Mapa',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar clima e pedágios',exact:true}).waitFor();
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('rdv_private_v2_'+id+'_trips')||'[]')[0]?.weatherSource==='Open-Meteo',traveler.user.id);
  await page.getByRole('button',{name:'Mostrar previsão de chuva',exact:true}).click();
  await page.locator('.weather-forecast-marker').first().waitFor();
  assert.ok(await page.locator('.weather-forecast-marker').count()>=2);
  await page.locator('.toll-marker').first().getByRole('button',{name:/^Comentários de /}).click();
  await page.getByRole('heading',{name:'Comentários do pedágio',exact:true}).waitFor();
  await page.getByRole('button',{name:'Fechar pedágio',exact:true}).click();
  await page.locator('.toll-marker').first().getByRole('button',{name:'Sugerir preço',exact:true}).focus();await page.locator('.toll-marker').first().getByRole('button',{name:'Sugerir preço',exact:true}).press('Enter');
  const toll=page.getByRole('dialog',{name:'Tarifas do pedágio',exact:true});
  await toll.getByText('Sem tarifa aprovada',{exact:true}).waitFor();
  await toll.getByLabel('Tarifa do pedágio',{exact:true}).fill('6,50');
  const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240"><rect width="100%" height="100%" fill="white"/><text x="30" y="120" font-size="52">CARRO 6,50</text></svg>')).jpeg().toBuffer();
  await toll.getByLabel('Foto da placa de pedágio',{exact:true}).setInputFiles({name:'tarifa.jpg',mimeType:'image/jpeg',buffer:image});
  await toll.getByRole('img',{name:'Foto da tarifa selecionada para envio',exact:true}).waitFor();
  await toll.getByRole('checkbox',{name:'Confirmo que a informação é deste pedágio e da categoria indicada.',exact:true}).check();
  await toll.getByRole('button',{name:'Enviar para análise',exact:true}).click();
  await toll.getByText('Tarifa enviada para análise do administrador.',{exact:true}).waitFor();
  await toll.getByText('Em análise',{exact:true}).waitFor();
  const entry=db.prepare('SELECT * FROM toll_entries').get() as any;
  assert.equal(entry.price,6.5);assert.equal(entry.status,'pending');assert.ok(entry.image_data.length);
  await page.screenshot({path:'test-results/toll-mobile-pending.png'});
  await admin.goto('http://127.0.0.1:3000/admin');
  await admin.getByText('1 tarifas de pedágio pendentes',{exact:true}).waitFor();
  await admin.getByRole('button',{name:'Solicitações',exact:true}).click();await admin.getByRole('button',{name:/^Tarifas de pedágio \(/}).click();
  const card=admin.locator('article').filter({has:admin.getByRole('heading',{name:'Praça da interface · Carro',exact:true})});
  await card.getByRole('img',{name:'Foto da placa de tarifas para conferência manual',exact:true}).waitFor();
  await card.getByLabel('Motivo / observações',{exact:true}).fill('Tarifa legível nos dois sentidos.');
  await card.getByRole('button',{name:'Aprovar e publicar',exact:true}).click();
  await card.waitFor({state:'hidden'});
  await admin.getByText('0 tarifas de pedágio pendentes',{exact:true}).waitFor();
  await toll.getByRole('button',{name:'Atualizar minhas contribuições',exact:true}).click();
  await toll.getByText('Aprovada',{exact:true}).waitFor();
  await toll.getByText(/Tarifa legível nos dois sentidos/).waitFor();
  await toll.getByRole('button',{name:'Fechar pedágio',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar clima e pedágios',exact:true}).click();
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('rdv_private_v2_'+id+'_trips')||'[]')[0]?.knownTollsCost===26,traveler.user.id);
  const updated=await page.evaluate(id=>JSON.parse(localStorage.getItem('rdv_private_v2_'+id+'_trips')||'[]')[0],traveler.user.id);
  assert.equal(updated.totalEstimatedCost,96);assert.equal(updated.costPerPerson,24);
  assert.equal(updated.tolls.length,1);assert.equal(updated.tolls[0].passages,2);assert.equal(updated.tolls[0].knownCost,13);
  await page.getByText('Pedágios: R$ 26.00 conhecidos · cobertura parcial',{exact:true}).waitFor();
  await page.locator('.toll-marker').first().getByRole('button',{name:'Sugerir preço',exact:true}).focus();await page.locator('.toll-marker').first().getByRole('button',{name:'Sugerir preço',exact:true}).press('Enter');
  await toll.getByText('R$ 13.00 conhecidos',{exact:true}).waitFor();
  assert.equal(await toll.getByText('R$ 6.50',{exact:true}).count(),2);
  await toll.getByRole('button',{name:'Fechar pedágio',exact:true}).click();
  await page.screenshot({path:'test-results/weather-tolls-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: previsão no mapa, foto de pedágio, status privado, aprovação e orçamento por passagem/veículos.');
} catch(error) {
  await page.screenshot({path:'test-results/part3-failure-mobile.png',fullPage:true}).catch(()=>{});
  await admin.screenshot({path:'test-results/part3-failure-admin.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await browser.close();await vite.close();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();fs.rmSync(directory,{recursive:true,force:true});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {openDatabase} from '../server/db';
import {createApi} from '../server/app';
import {createRadarSync,nextMonthlyRadarCheck,parseRadarCsv,radarAlertsForRoute,radarStatus} from '../server/radars';
import {upcomingRoadAlert} from '../src/services/roadAlertDistance';
import {roadAlertBannerText,roadAlertTitle} from '../src/services/roadAlertPresentation';
import type {RoadAlert} from '../src/types/roadAlerts';

const header='lat,lng,kind,limit_kmh,source,active,end_lat,end_lng,direction_deg';
const csv=(...rows:string[])=>header+'\n'+rows.join('\n')+'\n';
const east='-23.5,-46.595,FIXED,60,CET-SP+OSM,1,,,90';
const west='-23.5,-46.594,FIXED,50,DNIT,1,,,270';
const noDirection='-23.5,-46.593,FIXED,,OSM,1,,,';
const inactive='-23.5,-46.592,FIXED,40,OSM,0,,,90';
const red='-23.5,-46.591,RED_LIGHT,,CET-SP,1,,,90';
const route:[number,number][]=[[-23.5,-46.6],[-23.5,-46.58]];
const license='Pardal · © colaboradores do OpenStreetMap\nOpen Database License (ODbL) 1.0\nFontes: CET-SP, DNIT e OSM.';
function fixture(text:string,day='2026-11-12'){
  const zip=zipSync({'brasil/radares.csv':strToU8(text),'brasil/LICENCA-DADOS.txt':strToU8(license)});
  const release={tag_name:'dados-'+day,published_at:day+'T12:00:00Z',draft:false,prerelease:false,
    assets:[{name:'pardal-brasil-radares.zip',size:zip.byteLength,digest:'sha256:'+createHash('sha256').update(zip).digest('hex')}]};
  const calls:string[]=[];
  const fetcher=(async(url:string|URL|Request)=>{
    calls.push(String(url));
    if(String(url).endsWith('/releases/latest'))return Response.json(release);
    assert.equal(String(url),`https://github.com/murkiriel/pardal/releases/download/dados-${day}/pardal-brasil-radares.zip`);
    return new Response(zip);
  }) as typeof fetch;
  return {zip,release,calls,fetcher};
}

test('monthly due dates clamp calendar month ends, including leap years',()=>{
  assert.equal(nextMonthlyRadarCheck(Date.parse('2026-01-31T15:10:00Z')),'2026-02-28T15:10:00.000Z');
  assert.equal(nextMonthlyRadarCheck(Date.parse('2028-01-31T15:10:00Z')),'2028-02-29T15:10:00.000Z');
  assert.equal(nextMonthlyRadarCheck(Date.parse('2026-12-13T15:10:00Z')),'2027-01-13T15:10:00.000Z');
});

test('CSV keeps unknown values unknown, excludes malformed imports and merges exact duplicates',()=>{
  const records=parseRadarCsv(csv(east,noDirection,east.replace('CET-SP+OSM','DNIT')));
  assert.equal(records.length,2);
  assert.equal(records[0].source,'CET-SP+DNIT+OSM');
  assert.equal(records[1].limit,null);assert.equal(records[1].direction,null);
  for(const bad of [header,csv(east.replace('60','NaN')),csv(east.replace('-23.5','91')),
    csv(east.replace(',1,,,90',',1,,,360')),csv(east.replace('FIXED','SECTION')),
    csv(east.replace('CET-SP+OSM','<script>')),csv(east.replace(',1,,,90',',yes,,,90'))])
    assert.throws(()=>parseRadarCsv(bad));
});

test('initial import persists in the existing database and checks only once per calendar month across restarts',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'role-radars-')),file=join(folder,'role.sqlite');
  let db=openDatabase(file),time=Date.parse('2026-11-13T15:00:00Z');
  const source=fixture(csv(east,west,noDirection,inactive,red));
  try{
    let service=createRadarSync(db,{fetcher:source.fetcher,clock:()=>time,enabled:true});
    assert.equal((await service.run()).outcome,'updated');assert.equal(source.calls.length,2);
    assert.deepEqual([radarStatus(db,time).total,radarStatus(db,time).active],[5,4]);
    const before=radarStatus(db,time);
    assert.equal(before.nextCheckAt,'2026-12-13T15:00:00.000Z');
    assert.equal((await service.run()).outcome,'not_due');
    await service.close();db.close();db=openDatabase(file);
    service=createRadarSync(db,{fetcher:source.fetcher,clock:()=>time,enabled:true});
    time=Date.parse('2026-12-13T14:59:59Z');
    assert.equal((await service.run()).outcome,'not_due');assert.equal(source.calls.length,2);
    time+=1000;
    assert.equal((await service.run()).outcome,'unchanged');assert.equal(source.calls.length,3,'same hash downloads metadata only');
    assert.equal(radarStatus(db,time).updatedAt,before.updatedAt);
    assert.equal(radarStatus(db,time).nextCheckAt,'2027-01-13T15:00:00.000Z');
    assert.equal((db.prepare('SELECT source_csv FROM radar_sync').get() as any).source_csv.byteLength,
      Buffer.byteLength(csv(east,west,noDirection,inactive,red)));
    await service.close();
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});

test('replacement updates identities without duplicates, removes absent points, disables inactive cameras and preserves community reports',async()=>{
  const db=openDatabase(':memory:');let time=Date.parse('2026-11-13T15:00:00Z');
  try{
    const first=fixture(csv(east,west));
    await createRadarSync(db,{fetcher:first.fetcher,clock:()=>time}).run();
    const firstId=radarAlertsForRoute(db,route,time)[0].id;
    db.prepare(`INSERT INTO road_alerts(id,kind,lat,lng,status,created_at,expires_at) VALUES('community','pothole',-23.5,-46.59,'approved',?,?)`)
      .run(new Date(time).toISOString(),'2027-01-01');
    time=Date.parse('2026-12-13T15:00:00Z');
    const next=fixture(csv(east.replace(',60,',',80,'),inactive),'2026-12-12');
    assert.equal((await createRadarSync(db,{fetcher:next.fetcher,clock:()=>time}).run()).outcome,'updated');
    const alerts=radarAlertsForRoute(db,route,time);
    assert.equal(alerts.length,1);assert.equal(alerts[0].id,firstId);assert.equal(alerts[0].limitKmh,80);
    assert.equal(radarStatus(db,time).total,2);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM road_alerts').get() as any).n,1);
    assert.equal((await createRadarSync(db,{fetcher:next.fetcher,clock:()=>time}).run(true)).outcome,'unchanged');
    assert.equal(radarStatus(db,time).total,2);
  }finally{db.close();}
});

test('bad integrity, invalid CSV, provider failures and old releases preserve the last complete dataset and throttle retries',async()=>{
  const db=openDatabase(':memory:');let time=Date.parse('2026-11-13T15:00:00Z');
  const good=fixture(csv(east));
  try{
    await createRadarSync(db,{fetcher:good.fetcher,clock:()=>time}).run();
    time=Date.parse('2026-12-13T15:00:00Z');
    const broken=fixture(csv(west),'2026-12-12');broken.release.assets[0].digest='sha256:'+'a'.repeat(64);
    assert.equal((await createRadarSync(db,{fetcher:broken.fetcher,clock:()=>time}).run()).outcome,'failed');
    const original=radarAlertsForRoute(db,route,time)[0];assert.equal(original.limitKmh,60);
    assert.equal(radarStatus(db,time).lastCheckFailed,true);
    assert.equal((await createRadarSync(db,{fetcher:good.fetcher,clock:()=>time}).run()).outcome,'not_due');
    time+=86400000;
    const invalid=fixture(csv(east.replace('-23.5','999')),'2026-12-12');
    assert.equal((await createRadarSync(db,{fetcher:invalid.fetcher,clock:()=>time}).run()).outcome,'failed');
    assert.equal(radarAlertsForRoute(db,route,time)[0].id,original.id);
    time+=86400000;
    const unavailable=async()=>new Response('offline',{status:503});
    assert.equal((await createRadarSync(db,{fetcher:unavailable as typeof fetch,clock:()=>time}).run()).outcome,'failed');
    assert.equal(radarStatus(db,time).total,1);
    const older=fixture(csv(west),'2026-11-01');
    assert.equal((await createRadarSync(db,{fetcher:older.fetcher,clock:()=>time}).run(true)).outcome,'failed');
    assert.equal(radarAlertsForRoute(db,route,time)[0].id,original.id);
  }finally{db.close();}
});

test('concurrent sync requests share one download and a disabled updater never calls the source',async()=>{
  const db=openDatabase(':memory:'),source=fixture(csv(east));
  try{
    const service=createRadarSync(db,{fetcher:source.fetcher});
    const tasks=await Promise.all([service.run(),service.run(),service.run()]);
    assert.ok(tasks.every(r=>r.outcome==='updated'));assert.equal(source.calls.length,2);
    assert.equal((await createRadarSync(db,{enabled:false,fetcher:source.fetcher}).run(true)).outcome,'disabled');
    assert.equal(source.calls.length,2);
    await service.close();assert.equal((await service.run(true)).outcome,'disabled');
  }finally{db.close();}
});

test('route selection respects active flags, enforced direction, nearby parallel roads and unknown limits',async()=>{
  const db=openDatabase(':memory:'),time=Date.parse('2026-11-13T15:00:00Z');
  try{
    const parallel=east.replace('-23.5','-23.502');
    const source=fixture(csv(east,west,noDirection,inactive,red,parallel));
    await createRadarSync(db,{fetcher:source.fetcher,clock:()=>time}).run();
    const forward=radarAlertsForRoute(db,route,time);
    assert.deepEqual(forward.map(r=>r.lng).sort((a,b)=>a-b),[-46.595,-46.593,-46.591]);
    const unknown=forward.find(r=>r.lng===-46.593);assert.ok(unknown);assert.equal(unknown.limitKmh,null);
    const backward=radarAlertsForRoute(db,[...route].reverse(),time);
    assert.deepEqual(backward.map(r=>r.lng).sort((a,b)=>a-b),[-46.594,-46.593]);
    const upcoming=upcomingRoadAlert(forward,route,route[0],0,2,time);
    assert.ok(upcoming);
    assert.equal(upcoming.alert.lng,-46.595);
    assert.match(roadAlertBannerText(upcoming.alert.kind,upcoming.distanceKm,upcoming.alert),/60 km\/h/);
    const semaphore=forward.find(r=>r.cameraKind==='RED_LIGHT');assert.ok(semaphore);
    assert.equal(roadAlertTitle(semaphore),'Fiscalização de semáforo');
    assert.equal(upcomingRoadAlert([forward[0]],[...route].reverse(),route[1],0,2,time),null);
    const farParallel:RoadAlert={...forward[0],lat:-23.502,directionDegrees:null};
    assert.equal(upcomingRoadAlert([farParallel],route,route[0],0,2,time),null);
  }finally{db.close();}
});

test('existing API returns saved radars with attribution, exposes only public exports and never downloads on a read',async()=>{
  const db=openDatabase(':memory:'),source=fixture(csv(east,inactive));
  await createRadarSync(db,{fetcher:source.fetcher}).run();
  const server=createApi({db}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  try{
    const response=await fetch(base+'/road-alerts/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routePath:route})});
    assert.equal(response.status,200);
    const body=await response.json() as any;
    assert.equal(body.alerts.length,1);assert.equal(body.alerts[0].source,'pardal');
    assert.equal(body.alerts[0].limitKmh,60);assert.equal(body.radars.license,'ODbL-1.0');
    assert.equal(body.radars.updateFrequency,'monthly');
    const status=await (await fetch(base+'/radars/status')).json() as any;
    assert.equal(status.total,2);assert.equal(status.active,1);assert.equal('source_csv' in status,false);
    const exported=await fetch(base+'/radars/export.csv');
    assert.equal(exported.headers.get('x-data-license'),'ODbL-1.0');
    assert.equal(await exported.text(),csv(east,inactive));
    const attribution=await (await fetch(base+'/radars/license')).text();
    assert.match(attribution,/OpenStreetMap/);assert.match(attribution,/CET-SP/);assert.match(attribution,/ODbL/);
    assert.equal(source.calls.length,2,'client reads must never query Pardal');
    assert.equal((await fetch(base+'/radars/sync',{method:'POST'})).status,404,'no public force-refresh endpoint');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});

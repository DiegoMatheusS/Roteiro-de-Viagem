import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import type {Express} from 'express';
import type {FuelDatabase} from './db';
import {clientIp} from './http';
import type {Coordinates} from './maps';
import type {RoadAlert, RadarKind} from '../src/types/roadAlerts';
import {radarMatchesDirection} from '../src/services/radarDirection';

const REPOSITORY='https://github.com/murkiriel/pardal';
const RELEASE_API='https://api.github.com/repos/murkiriel/pardal/releases/latest';
const ASSET='pardal-brasil-radares.zip';
const DAY=86400000,MAX_CSV=10*1024*1024;
export const RADAR_ATTRIBUTION='Pardal · © colaboradores do OpenStreetMap e fontes públicas indicadas na base';
const columns='lat,lng,kind,limit_kmh,source,active,end_lat,end_lng,direction_deg';
type Camera={id:string;lat:number;lng:number;kind:RadarKind;limit:number|null;source:string;active:number;
  endLat:number|null;endLng:number|null;direction:number|null};
type SyncRow={release_tag:string|null;digest:string|null;checked_at:string|null;updated_at:string|null;
  source_updated_at:string|null;next_check_at:string|null;next_attempt_at:string;last_error:string};

/** Separate public dataset: never mixes imported records with moderated reports or account data. */
export function initializeRadarDatabase(db:FuelDatabase){
  db.exec(`CREATE TABLE IF NOT EXISTS radar_cameras (
    id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('FIXED','SECTION','RED_LIGHT')),
    lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
    limit_kmh REAL,source TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)),
    end_lat REAL,end_lng REAL,direction_deg REAL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    generation TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS radar_cameras_geo ON radar_cameras(active,lat,lng);
  CREATE TABLE IF NOT EXISTS radar_sync (
    id INTEGER PRIMARY KEY CHECK(id=1),release_tag TEXT,digest TEXT,checked_at TEXT,updated_at TEXT,
    source_updated_at TEXT,next_check_at TEXT,next_attempt_at TEXT NOT NULL,last_error TEXT NOT NULL DEFAULT '',
    source_csv BLOB,license_text TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO radar_sync(id,next_attempt_at) VALUES(1,'1970-01-01T00:00:00.000Z');`);
}
// Metadata reads must not copy the complete CSV BLOB on every navigation request.
const syncRow=(db:FuelDatabase)=>db.prepare(`SELECT release_tag,digest,checked_at,updated_at,
  source_updated_at,next_check_at,next_attempt_at,last_error FROM radar_sync WHERE id=1`).get() as SyncRow;

/** One calendar month after the successful check; clamp Jan 31 to February's last day. */
export function nextMonthlyRadarCheck(timestamp:number):string{
  const date=new Date(timestamp),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));return date.toISOString();
}

export function radarStatus(db:FuelDatabase,clock=Date.now()){
  const row=syncRow(db);
  const counts=db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(active),0) AS active FROM radar_cameras').get() as {total:number;active:number};
  return {available:counts.total>0,...counts,release:row.release_tag,checkedAt:row.checked_at,
    updatedAt:row.updated_at,sourceUpdatedAt:row.source_updated_at,nextCheckAt:row.next_check_at,
    stale:!row.next_check_at||Date.parse(row.next_check_at)<=clock,lastCheckFailed:!!row.last_error,
    source:'Pardal',sourceUrl:REPOSITORY,attribution:RADAR_ATTRIBUTION,license:'ODbL-1.0',
    licenseUrl:'/api/radars/license',exportUrl:'/api/radars/export.csv',updateFrequency:'monthly'};
}

/** The source CSV has numeric fields and a short source code, never free text/embedded CSV. */
export function parseRadarCsv(csv:string):Camera[]{
  if(Buffer.byteLength(csv)>MAX_CSV)throw Error('Base de radares acima do limite.');
  const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.shift()!==columns||!lines.length||lines.length>100000)throw Error('Formato da base de radares inválido.');
  const cameras=new Map<string,Camera>();
  const number=(value:string,min:number,max:number,optional=false):number|null=>{
    if(optional&&value==='')return null;
    if(!/^-?\d+(?:\.\d+)?$/.test(value))throw Error('Número inválido na base de radares.');
    const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw Error('Valor inválido na base de radares.');return n;
  };
  for(const line of lines){
    const v=line.split(',');
    if(v.length!==9||!['FIXED','SECTION','RED_LIGHT'].includes(v[2])||!['0','1'].includes(v[5])||
      !/^[A-Z0-9_+\/-]{1,160}$/.test(v[4]))throw Error('Registro inválido na base de radares.');
    const lat=number(v[0],-90,90)!,lng=number(v[1],-180,180)!,kind=v[2] as RadarKind;
    const limit=number(v[3],1,300,true),endLat=number(v[6],-90,90,true),endLng=number(v[7],-180,180,true);
    const direction=number(v[8],0,359.999,true);
    if((endLat===null)!==(endLng===null)||kind==='SECTION'&&endLat===null)throw Error('Trecho de radar incompleto.');
    // Limit, active flag and source can change without generating another camera identity.
    const id='pardal:'+createHash('sha256').update(JSON.stringify([lat,lng,kind,endLat,endLng,direction])).digest('hex').slice(0,24);
    const previous=cameras.get(id);
    cameras.set(id,{id,lat,lng,kind,limit:limit??previous?.limit??null,
      source:[...new Set([...(previous?.source.split('+')??[]),...v[4].split('+')])].sort().join('+'),
      active:Number(v[5]),endLat,endLng,direction});
  }
  if(!cameras.size)throw Error('Base de radares vazia.');return [...cameras.values()];
}

async function boundedBytes(response:Response,max:number){
  if(!response.ok||Number(response.headers.get('content-length'))>max||!response.body){
    await response.body?.cancel();throw Error('Download dos radares indisponível.');
  }
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>max){await reader.cancel();throw Error('Download dos radares acima do limite.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}

export interface RadarSyncOptions{fetcher?:typeof fetch;clock?:()=>number;enabled?:boolean}
/** Upstream is contacted by this background job only, never by a map/API request. */
export function createRadarSync(db:FuelDatabase,{fetcher=fetch,clock=Date.now,enabled=process.env.PARDAL_ENABLED!=='0'}:RadarSyncOptions={}){
  let pending:Promise<{outcome:string}>|null=null,closed=false;
  const abort=new AbortController();
  const run=(force=false):Promise<{outcome:string}>=>{
    if(pending)return pending;
    if(closed||!enabled)return Promise.resolve({outcome:'disabled'});
    const previous=syncRow(db),time=clock();
    if(!force&&(Date.parse(previous.next_attempt_at)>time||previous.next_check_at&&Date.parse(previous.next_check_at)>time))
      return Promise.resolve({outcome:'not_due'});
    // Persist retry throttling before I/O; restarts during a provider failure cannot multiply requests.
    db.prepare('UPDATE radar_sync SET next_attempt_at=? WHERE id=1').run(new Date(time+DAY).toISOString());
    pending=(async()=>{
      await Promise.resolve();
      try{
        const request=async(url:string,max:number)=>boundedBytes(await fetcher(url,{
          headers:{Accept:'application/vnd.github+json','User-Agent':'Role-Radar-Sync'},
          signal:AbortSignal.any([abort.signal,AbortSignal.timeout(45000)])
        }),max);
        const release=JSON.parse((await request(RELEASE_API,2*1024*1024)).toString('utf8'));
        if(!/^dados-\d{4}-\d{2}-\d{2}$/.test(release.tag_name)||release.draft||release.prerelease||
          !Number.isFinite(Date.parse(release.published_at))||Date.parse(release.published_at)>clock()+DAY)
          throw Error('Versão de radares inválida.');
        const asset=release.assets?.find((a:any)=>a.name===ASSET);
        if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest)||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>10*1024*1024)
          throw Error('Integridade da base de radares indisponível.');
        if(previous.source_updated_at&&Date.parse(release.published_at)<Date.parse(previous.source_updated_at))
          throw Error('A fonte retornou uma versão anterior dos radares.');
        const checkedAt=new Date(clock()).toISOString(),nextCheck=nextMonthlyRadarCheck(clock());
        if(asset.digest===previous.digest){
          db.prepare(`UPDATE radar_sync SET checked_at=?,next_check_at=?,next_attempt_at=?,last_error='',release_tag=? WHERE id=1`)
            .run(checkedAt,nextCheck,nextCheck,release.tag_name);
          return {outcome:'unchanged'};
        }
        const zip=await request(`${REPOSITORY}/releases/download/${release.tag_name}/${ASSET}`,10*1024*1024);
        if(zip.length!==asset.size||'sha256:'+createHash('sha256').update(zip).digest('hex')!==asset.digest)
          throw Error('Verificação de integridade dos radares falhou.');
        const files=unzipSync(zip,{filter:file=>{
          if(!['brasil/radares.csv','brasil/LICENCA-DADOS.txt'].includes(file.name))return false;
          if(file.originalSize>(file.name.endsWith('.csv')?MAX_CSV:128*1024))throw Error('Arquivo de radares acima do limite.');
          return true;
        }});
        const raw=files['brasil/radares.csv'],license=files['brasil/LICENCA-DADOS.txt'];
        if(!raw||!license)throw Error('Pacote de radares incompleto.');
        const csv=Buffer.from(raw).toString('utf8'),licenseText=Buffer.from(license).toString('utf8');
        if(!/ODbL|Open Database License/i.test(licenseText))throw Error('Licença dos radares ausente.');
        const cameras=parseRadarCsv(csv),updatedAt=new Date(clock()).toISOString();
        const insert=db.prepare(`INSERT INTO radar_cameras(id,kind,lat,lng,limit_kmh,source,active,end_lat,end_lng,direction_deg,created_at,updated_at,generation)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET limit_kmh=excluded.limit_kmh,source=excluded.source,
          active=excluded.active,updated_at=excluded.updated_at,generation=excluded.generation`);
        db.exec('BEGIN IMMEDIATE');
        try{
          for(const c of cameras)insert.run(c.id,c.kind,c.lat,c.lng,c.limit,c.source,c.active,c.endLat,c.endLng,c.direction,updatedAt,updatedAt,asset.digest);
          db.prepare('DELETE FROM radar_cameras WHERE generation<>?').run(asset.digest);
          db.prepare(`UPDATE radar_sync SET release_tag=?,digest=?,checked_at=?,updated_at=?,source_updated_at=?,
            next_check_at=?,next_attempt_at=?,last_error='',source_csv=?,license_text=? WHERE id=1`)
            .run(release.tag_name,asset.digest,checkedAt,updatedAt,release.published_at,nextCheck,nextCheck,Buffer.from(raw),licenseText);
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        return {outcome:'updated'};
      }catch{
        db.prepare("UPDATE radar_sync SET last_error='Atualização indisponível; última base preservada.' WHERE id=1").run();
        return {outcome:'failed'};
      }finally{pending=null;}
    })();return pending;
  };
  return {run,async close(){closed=true;abort.abort();await pending;}};
}

export function startRadarUpdates(db:FuelDatabase,options:RadarSyncOptions={}){
  const sync=createRadarSync(db,options);
  const run=()=>{void sync.run().then(result=>{
    if(result.outcome==='updated')console.log(`Radares: base Pardal salva no banco (${radarStatus(db).active} ativos); próxima consulta mensal agendada.`);
    if(result.outcome==='failed')console.warn('Radares: fonte indisponível; banco preservado. Nova tentativa em 24 horas.');
  });};
  run();
  // Local due-date check. No upstream requests until the persisted monthly deadline.
  const timer=setInterval(run,6*3600000);timer.unref();
  return {async close(){clearInterval(timer);await sync.close();}};
}

export function radarAlertsForRoute(db:FuelDatabase,path:Coordinates[],clock=Date.now()):RoadAlert[]{
  const minLat=Math.min(...path.map(p=>p[0]))-.002,maxLat=Math.max(...path.map(p=>p[0]))+.002;
  const minLng=Math.min(...path.map(p=>p[1]))-.004,maxLng=Math.max(...path.map(p=>p[1]))+.004;
  const cameras=db.prepare('SELECT * FROM radar_cameras WHERE active=1 AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?')
    .all(minLat,maxLat,minLng,maxLng) as any[];
  const segments=path.slice(1).map((b,i)=>({a:path[i],b}));
  const matches=cameras.filter(c=>segments.some(({a,b})=>{
    if(c.lat<Math.min(a[0],b[0])-.002||c.lat>Math.max(a[0],b[0])+.002||
      c.lng<Math.min(a[1],b[1])-.004||c.lng>Math.max(a[1],b[1])+.004)return false;
    const factor=Math.cos(c.lat*Math.PI/180),x=(c.lng-a[1])*111.195*factor,y=(c.lat-a[0])*111.195;
    const dx=(b[1]-a[1])*111.195*factor,dy=(b[0]-a[0])*111.195;
    const t=Math.max(0,Math.min(1,(x*dx+y*dy)/Math.max(dx*dx+dy*dy,1e-12)));
    return Math.hypot(x-t*dx,y-t*dy)<=0.08&&radarMatchesDirection(c.direction_deg,a,b);
  }));
  // expiresAt bounds the client's cached response; it does not delete the saved dataset.
  return matches.map(c=>({id:c.id,kind:'speed_camera',lat:c.lat,lng:c.lng,note:
    `${c.kind==='RED_LIGHT'?'Fiscalização de semáforo':c.kind==='SECTION'?'Radar de trecho':'Radar fixo'}${c.limit_kmh?` · ${c.limit_kmh} km/h`:''}`,
    createdAt:c.created_at,expiresAt:new Date(clock+DAY).toISOString(),source:'pardal',cameraKind:c.kind,
    limitKmh:c.limit_kmh,directionDegrees:c.direction_deg,dataSource:c.source,datasetUpdatedAt:c.updated_at}));
}

export function registerRadarRoutes(app:Express,db:FuelDatabase,limit:(key:string,max:number,ms:number)=>void){
  app.get('/api/radars/status',(req,res)=>{
    limit(`radar-status:${clientIp(req)}`,30,60000);res.json(radarStatus(db));
  });
  app.get('/api/radars/export.csv',(req,res)=>{
    limit(`radar-export:${clientIp(req)}`,4,60000);
    const row=db.prepare('SELECT source_csv FROM radar_sync WHERE id=1').get() as {source_csv:Uint8Array|null};
    if(!row.source_csv){res.status(503).json({error:'Base de radares ainda indisponível.'});return;}
    res.setHeader('X-Data-License','ODbL-1.0');res.setHeader('Link','</api/radars/license>; rel="license"');
    res.type('text/csv').attachment('role-radares-pardal.csv').send(Buffer.from(row.source_csv));
  });
  app.get('/api/radars/license',(_req,res)=>{
    const row=db.prepare('SELECT license_text FROM radar_sync WHERE id=1').get() as {license_text:string};
    res.type('text/plain').send(`${RADAR_ATTRIBUTION}\n${REPOSITORY}\nhttps://opendatacommons.org/licenses/odbl/1-0/\n\n${row.license_text}`);
  });
}

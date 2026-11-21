import type {DurableObjectNamespace,DurableObjectState,R2Bucket,ImagesBinding,Request as WorkerRequest} from '@cloudflare/workers-types';
import {httpServerHandler} from 'cloudflare:node';
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {createApi} from '../server/api';
import {initializeDatabase} from '../server/schema';
import {bootstrapInitialAdmin} from '../server/bootstrap-admin';
import {createRadarSync,type RadarSourceStore} from '../server/radars';
import {durableSqlite} from './sqlite';
import {edgeTrafficRedOnlyPng,sanitizeEdgePhoto,type PhotoImagesBinding} from './images';
import {restoreFromR2} from './restore';

interface Env{
  RUAVO_DATABASE:DurableObjectNamespace;
  RADAR_SOURCES:R2Bucket;
  IMAGES:ImagesBinding;
  WEB_PROXY_SECRET?:string;
  PUBLIC_APP_URL?:string;
  PUBLIC_ADMIN_URL?:string;
  PUBLIC_API_URL?:string;
  PARDAL_ENABLED?:string;
  TOMTOM_TRAFFIC_API_KEY?:string;
  RDV_BOOTSTRAP_ADMIN_EMAIL?:string;
  RDV_BOOTSTRAP_ADMIN_HASH?:string;
  RUAVO_DATABASE_NAME?:string;
  RUAVO_RESTORE_OBJECT?:string;
}
const defaultDatabase='ruavo-production';
const databaseId=(env:Env)=>env.RUAVO_DATABASE.idFromName(env.RUAVO_DATABASE_NAME||defaultDatabase);
type HealthComponent='proxy-secret'|'public-app-url'|'durable-object'|'database-restore'|'database-http'|'database-alarm';
function unavailable(url:URL,component:HealthComponent,error?:unknown){
  const headers=new Headers({'Cache-Control':'no-store'});
  if(url.pathname==='/api/health'){
    headers.set('X-Ruavo-Health-Error',component);
    if(error)console.error('RUAVO health failure',component,error);
  }
  return Response.json({error:'O servidor ainda não está configurado.'},{status:503,headers});
}
const validOrigin=(value:string|undefined)=>{
  try{const url=new URL(value||'');return url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password;}catch{return false;}
};
const sources=(bucket:R2Bucket):RadarSourceStore=>({
  async put(key,data){await bucket.put(key,Uint8Array.from(data),{httpMetadata:{contentType:'text/csv'}});},
  async get(key){const object=await bucket.get(key);return object?new Uint8Array(await object.arrayBuffer()):null;},
});

/** One persistent SQLite actor retains the existing single-database model.
 * No local volume, process interval or ephemeral container stores user data. */
export class RuavoDatabase{
  private readonly db;
  private readonly api;
  private readonly radarSync;
  private restoration?:Promise<void>;
  constructor(private readonly ctx:DurableObjectState,private readonly env:Env){
    this.db=durableSqlite(ctx.storage);
    initializeDatabase(this.db);
    if(!env.RUAVO_RESTORE_OBJECT)
      bootstrapInitialAdmin(this.db,{email:env.RDV_BOOTSTRAP_ADMIN_EMAIL,passwordHash:env.RDV_BOOTSTRAP_ADMIN_HASH});
    const sourceStore=sources(env.RADAR_SOURCES);
    this.api=createApi({db:this.db,migrateLocalPhotos:false,photoDirectory:'/tmp/ruavo-photos',
      sanitizePhoto:bytes=>sanitizeEdgePhoto(env.IMAGES as unknown as PhotoImagesBinding,bytes),
      backgroundTask:task=>ctx.waitUntil(task),
      traffic:{key:()=>env.TOMTOM_TRAFFIC_API_KEY||'',redOnlyPng:edgeTrafficRedOnlyPng,
        publicOrigin:req=>req.get('X-Ruavo-Api-Origin')||''},radarSourceStore:sourceStore});
    this.radarSync=createRadarSync(this.db,{enabled:env.PARDAL_ENABLED!=='0',sourceStore});
  }
  private async restoreIfConfigured(){
    const key=this.env.RUAVO_RESTORE_OBJECT;
    if(!key)return;
    this.restoration??=restoreFromR2(this.db,this.env.RADAR_SOURCES,key).catch(error=>{
      this.restoration=undefined;
      throw error;
    });
    await this.restoration;
  }
  private async schedule(){
    const times:number[]=[];
    if(this.env.PARDAL_ENABLED!=='0'){
      const radar=this.db.prepare('SELECT next_attempt_at,next_check_at FROM radar_sync WHERE id=1').get() as {next_attempt_at:string;next_check_at:string|null};
      times.push(Math.max(Date.parse(radar.next_attempt_at),radar.next_check_at?Date.parse(radar.next_check_at):0));
    }
    if(this.api.locals.feedbackMail.status().configured){
      const mail=this.db.prepare('SELECT MIN(next_attempt_at) AS due FROM place_feedback_mail WHERE sent_at IS NULL').get() as {due:string|null};
      if(mail.due)times.push(Date.parse(mail.due));
    }
    const due=times.filter(Number.isFinite);
    if(!due.length){await this.ctx.storage.deleteAlarm();return;}
    const next=Math.max(Date.now()+1000,Math.min(...due));
    const previous=await this.ctx.storage.getAlarm();
    if(previous===null||previous>next)await this.ctx.storage.setAlarm(next);
  }
  async fetch(request:Request):Promise<Response>{
    let component:HealthComponent='database-restore';
    try{
      await this.restoreIfConfigured();
      component='database-http';
      const context={waitUntil:(task:Promise<unknown>)=>this.ctx.waitUntil(task),passThroughOnException(){},props:{}};
      const server=createServer(this.api);
      try{
        const response=await httpServerHandler(server).fetch(request,this.env,context);
        component='database-alarm';
        await this.schedule();
        component='database-http';
        return response;
      }finally{server.close();}
    }catch(error){
      const url=new URL(request.url);
      if(url.pathname!=='/api/health')throw error;
      return unavailable(url,component,error);
    }
  }
  async alarm(){
    if(this.ctx.id.toString()!==databaseId(this.env).toString())return;
    await this.restoreIfConfigured();
    try{await this.radarSync.run();await this.api.locals.feedbackMail.flush();}
    finally{await this.schedule();}
  }
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname!=='/api'&&!url.pathname.startsWith('/api/'))return new Response('RUAVO API',{status:404});
    if(!env.WEB_PROXY_SECRET||env.WEB_PROXY_SECRET.length<32)return unavailable(url,'proxy-secret');
    if(!validOrigin(env.PUBLIC_APP_URL))return unavailable(url,'public-app-url');
    const headers=new Headers(request.headers),provided=Buffer.from(headers.get('X-Rdv-Proxy-Key')||''),expected=Buffer.from(env.WEB_PROXY_SECRET);
    const forwarded=headers.get('X-Rdv-Client-Ip')||'';
    const trusted=provided.length===expected.length&&timingSafeEqual(provided,expected)&&isIP(forwarded);
    const client=trusted?forwarded:headers.get('CF-Connecting-IP')||'';
    for(const name of ['Forwarded','X-Forwarded-For','X-Forwarded-Host','X-Forwarded-Proto','X-Real-IP','X-Rdv-Proxy-Key','X-Rdv-Client-Ip'])headers.delete(name);
    headers.set('X-Rdv-Proxy-Key',env.WEB_PROXY_SECRET);
    headers.set('X-Ruavo-Api-Origin',url.origin);
    if(isIP(client))headers.set('X-Rdv-Client-Ip',client);
    try{
      const object=env.RUAVO_DATABASE.get(databaseId(env));
      // Importable Cloudflare types include platform-only extensions. This is
      // the same standard Request object at the runtime boundary.
      return await object.fetch(new Request(request,{headers}) as unknown as WorkerRequest) as unknown as Response;
    }catch(error){return unavailable(url,'durable-object',error);}
  },
};

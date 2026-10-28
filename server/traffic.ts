import type {Express} from 'express';
import {ApiError,asyncRoute,clientIp} from './http';
import type {createRateLimiter} from './rateLimit';

const TTL=60000,MAX_TILE_BYTES=512*1024,MAX_CACHE_BYTES=16*1024*1024;
const unavailable=()=>new ApiError('Trânsito ao vivo indisponível no momento.',503);
type Tile={data:Buffer;expires:number;observedAt:number};
export interface TrafficOptions {fetcher?:typeof fetch;key?:()=>string;clock?:()=>number}

/** Only the server knows the key. Requests always go to the fixed TomTom host;
 * neither a client's URL nor an upstream error body can escape this proxy. */
export function createTrafficService({fetcher=fetch,key=()=>process.env.TOMTOM_TRAFFIC_API_KEY||'',clock=Date.now}:TrafficOptions={}){
  const cache=new Map<string,Tile>(),pending=new Map<string,Promise<Tile>>();
  let cacheBytes=0,blockedUntil=0;
  const enabled=()=>Boolean(key().trim())&&clock()>=blockedUntil;
  const getTile=async(style:string,z:string,x:string,y:string):Promise<Tile>=>{
    if(!['light','dark'].includes(style)||![z,x,y].every(value=>/^(0|[1-9]\d{0,7})$/.test(value))||
      Number(z)>22||Number(x)>=2**Number(z)||Number(y)>=2**Number(z))
      throw new ApiError('Bloco de trânsito inválido.',400);
    if(!enabled())throw unavailable();
    const id=`${style}/${z}/${x}/${y}`,cached=cache.get(id);
    if(cached&&cached.expires>clock())return cached;
    if(pending.has(id))return pending.get(id)!;
    if(pending.size>=64)throw unavailable();
    const task=(async()=>{
      try{
        await Promise.resolve(); // Store even a synchronously failing provider before cleanup.
        const response=await fetcher(`https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=${style}&tileSize=256`,{
          headers:{'TomTom-Api-Key':key().trim(),Accept:'image/png'},signal:AbortSignal.timeout(6000),redirect:'error'
        });
        if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png')||
          Number(response.headers.get('content-length'))>MAX_TILE_BYTES||!response.body){
          await response.body?.cancel();throw unavailable();
        }
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try{
          while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
            if(size>MAX_TILE_BYTES){await reader.cancel();throw unavailable();}chunks.push(value);}
        }finally{reader.releaseLock();}
        const data=Buffer.concat(chunks);
        if(data.length<24||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
          data.toString('ascii',12,16)!=='IHDR'||data.readUInt32BE(16)!==256||data.readUInt32BE(20)!==256)throw unavailable();
        const now=clock(),providerAge=/max-age=(\d+)/i.exec(response.headers.get('cache-control')||'');
        const ttl=providerAge?Math.min(TTL,Number(providerAge[1])*1000):TTL;
        const tile={data,observedAt:now,expires:now+ttl};
        if(cached){cacheBytes-=cached.data.length;cache.delete(id);}
        for(const [entry,item] of cache){
          if(item.expires<=now||cache.size>=256||cacheBytes+size>MAX_CACHE_BYTES){cache.delete(entry);cacheBytes-=item.data.length;}
        }
        cache.set(id,tile);cacheBytes+=size;return tile;
      }catch{
        // A bad key, quota or outage must not multiply into a request per tile.
        blockedUntil=clock()+TTL;throw unavailable();
      }finally{pending.delete(id);}
    })();
    pending.set(id,task);return task;
  };
  return {enabled,getTile};
}

function publicApiOrigin(){
  const configured=process.env.PUBLIC_API_URL||(process.env.RAILWAY_PUBLIC_DOMAIN?`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`:'');
  if(!configured)return '';
  try{const url=new URL(configured);if(url.protocol==='https:'&&!url.username&&!url.password)return url.origin;}catch{/* Use same-origin on the web. */}
  return '';
}

export function registerTrafficRoutes(app:Express,limit:ReturnType<typeof createRateLimiter>,options:TrafficOptions={}){
  const service=createTrafficService(options);
  app.get('/api/traffic/status',(req,res)=>{
    limit(`traffic-status:${clientIp(req)}`,30,60000);
    const available=service.enabled();
    res.json({available,provider:'TomTom',refreshSeconds:60,
      tileUrl:available?`${publicApiOrigin()}/api/traffic/tiles/{style}/{z}/{x}/{y}.png`:null,
      attribution:'© TomTom',routeTimesIncludeTraffic:false});
  });
  app.get('/api/traffic/tiles/:style/:z/:x/:y.png',asyncRoute(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
    const tile=await service.getTile(req.params.style,req.params.z,req.params.x,req.params.y);
    res.setHeader('Cache-Control',`public, max-age=${Math.max(0,Math.floor((tile.expires-Date.now())/1000))}, must-revalidate`);
    res.setHeader('X-Traffic-Observed-At',String(tile.observedAt));
    res.type('image/png').send(tile.data);
  }));
}

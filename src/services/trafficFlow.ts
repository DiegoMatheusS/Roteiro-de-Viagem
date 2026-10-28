import {fuelApi} from './fuelApi';

export const TRAFFIC_SOURCE_ID='role-traffic-flow';
export const TRAFFIC_MIN_ZOOM=10;
export const TRAFFIC_MAX_CAMERA_RADIUS_KM=10;
/** Furthest viewport corner, never a request for traffic outside the map view. */
export function trafficViewportRadiusKm(center:[number,number],sw:[number,number],ne:[number,number]):number {
  const values=[...center,...sw,...ne];
  if(!values.every(Number.isFinite))return Infinity;
  const rad=Math.PI/180,meters=(a:[number,number],b:[number,number])=>{
    const dLat=(b[0]-a[0])*rad,dLon=(b[1]-a[1])*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLon/2)**2;
    return 12742*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
  };
  return Math.max(...[sw,ne,[sw[0],ne[1]],[ne[0],sw[1]]].map(p=>meters(center,p as [number,number])));
}

export type TrafficState='loading'|'live'|'unavailable'|'off'|'offline'|'paused'|'zoom-in';
export interface TrafficConfig {available:boolean;tileUrl:string|null;attribution:string;refreshSeconds:number}
export interface TrafficMapPort {
  getZoom:()=>number;
  getViewportRadiusKm:()=>number;
  isMoving:()=>boolean;
  setTiles:(url:string|null,attribution?:string)=>void;
  listen:(events:{idle:()=>void;style:()=>void;loaded:()=>void;error:()=>void})=>()=>void;
}
interface Options {
  port:TrafficMapPort;onState:(state:TrafficState)=>void;offline?:boolean;initialEnabled?:boolean;
  load?:(signal:AbortSignal)=>Promise<TrafficConfig>;
  clock?:()=>number;doc?:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;
  page?:Pick<Window,'addEventListener'|'removeEventListener'>;online?:()=>boolean;
}

/** Traffic is independent of GPS renders. Refresh only while visible and idle;
 * failures remove the overlay rather than leave stale green roads on screen. */
export function createTrafficFlowController({port,onState,offline=false,initialEnabled=true,
  load=signal=>fuelApi<TrafficConfig>('/traffic/status',{signal}),clock=Date.now,
  doc=globalThis.document,page=globalThis.window,online=()=>globalThis.navigator?.onLine!==false}:Options){
  let enabled=initialEnabled,disposed=false,pageHidden=false,state:TrafficState|undefined;
  let config:TrafficConfig|null=null,appliedUrl:string|null=null,nextRequest=0,generation=0;
  let request:AbortController|null=null,timer:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
  const emit=(value:TrafficState)=>{if(!disposed&&state!==value){state=value;onState(value);}};
  const active=()=>!disposed&&enabled&&!offline&&online()&&!doc?.hidden&&!pageHidden;
  const withinRadius=()=>port.getViewportRadiusKm()<=TRAFFIC_MAX_CAMERA_RADIUS_KM;
  const remove=()=>{appliedUrl=null;port.setTiles(null);};
  const cancel=()=>{generation++;request?.abort();request=null;clearTimeout(timer);clearTimeout(deadline);timer=undefined;deadline=undefined;};
  const schedule=()=>{
    clearTimeout(timer);timer=undefined;
    if(active()&&port.getZoom()>=TRAFFIC_MIN_ZOOM&&withinRadius())
      timer=setTimeout(()=>{timer=undefined;reconcile();},Math.max(1000,nextRequest-clock()));
  };
  const apply=()=>{
    if(!config?.available||!config.tileUrl){remove();emit('unavailable');return;}
    // TomTom's light palette retains red even for very heavy traffic. Keep the
    // same green/yellow/red meaning on both day and night base maps.
    const url=config.tileUrl.replace('{style}','light')+`?v=${Math.floor(clock()/60000)}`;
    if(url!==appliedUrl){appliedUrl=url;emit('loading');port.setTiles(url,config.attribution);}
  };
  const refresh=async()=>{
    if(request)return;
    const controller=new AbortController(),id=++generation;request=controller;
    nextRequest=clock()+60000;
    // A missing key or unavailable API must remain an honest status, never
    // inferred green traffic. Native bridges may not honor AbortSignal yet.
    emit('loading');
    const timeout=new Promise<never>((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},10000);});
    try{
      const result=await Promise.race([load(controller.signal),timeout]);
      if(disposed||generation!==id||!active())return;
      config=result;
      // Keep any network completion out of an active pan/pinch gesture.
      if(!port.isMoving())apply();
    }catch{
      if(disposed||generation!==id)return;
      config=null;remove();emit('unavailable');
    }finally{
      if(generation===id){clearTimeout(deadline);deadline=undefined;request=null;schedule();}
    }
  };
  function reconcile(){
    if(!active()){
      cancel();remove();emit(!enabled?'off':offline||!online()?'offline':'paused');return;
    }
    if(port.getZoom()<TRAFFIC_MIN_ZOOM||!withinRadius()){
      cancel();remove();emit('zoom-in');return;
    }
    if(port.isMoving()){clearTimeout(timer);timer=undefined;return;}
    if(clock()>=nextRequest){void refresh();return;}
    if(config)apply();
    schedule();
  }
  const onError=()=>{
    if(!active()||!appliedUrl)return;
    cancel();config=null;remove();nextRequest=clock()+60000;emit('unavailable');schedule();
  };
  const unlisten=port.listen({idle:reconcile,style:()=>{appliedUrl=null;reconcile();},
    loaded:()=>{if(active()&&appliedUrl)emit('live');},error:onError});
  const hide=()=>{pageHidden=true;reconcile();},show=()=>{pageHidden=false;reconcile();};
  doc?.addEventListener('visibilitychange',reconcile);
  page?.addEventListener('pagehide',hide);page?.addEventListener('pageshow',show);
  page?.addEventListener('online',reconcile);page?.addEventListener('offline',reconcile);
  reconcile();
  return {
    setEnabled(value:boolean){enabled=value;reconcile();},
    setOffline(value:boolean){offline=value;reconcile();},
    destroy(){
      if(disposed)return;disposed=true;cancel();unlisten();remove();
      doc?.removeEventListener('visibilitychange',reconcile);
      page?.removeEventListener('pagehide',hide);page?.removeEventListener('pageshow',show);
      page?.removeEventListener('online',reconcile);page?.removeEventListener('offline',reconcile);
    }
  };
}

export function isTrafficMapError(event:{sourceId?:unknown;error?:{message?:string;url?:string}}):boolean {
  return event.sourceId===TRAFFIC_SOURCE_ID||
    /\/api\/traffic\/tiles\//.test(`${event.error?.url||''} ${event.error?.message||''}`);
}

import {addProtocol,type StyleSpecification} from 'maplibre-gl';
import {getOfflineRegion,loadOfflineTile} from './offlineMapStorage';
import {offlineRegionReady,offlineTileBelongs,type OfflineRegion} from './offlineMapRegions';

export const OFFLINE_MAP_PROTOCOL='role-offline';
const TILE_URL=/^role-offline:\/\/([a-zA-Z0-9_-]{1,80})\/(\d{1,2})\/(\d{1,10})\/(\d{1,10})$/;
export interface OfflineMapRequest {regionId:string;z:number;x:number;y:number}

/** Offline URLs are internal identifiers, never URLs for third-party servers. */
export function parseOfflineMapRequest(url:string):OfflineMapRequest|null{
  const match=TILE_URL.exec(url);
  if(!match)return null;
  const z=Number(match[2]),x=Number(match[3]),y=Number(match[4]);
  if(!Number.isSafeInteger(z)||z<0||z>17||!Number.isSafeInteger(x)||
    !Number.isSafeInteger(y)||x<0||y<0||x>=2**z||y>=2**z)return null;
  return {regionId:match[1],z,x,y};
}
export function offlineRasterStyle(region:OfflineRegion):StyleSpecification{
  if(!offlineRegionReady(region)||!region.offlinePermissionConfirmed)
    throw Error('Pacote incompleto ou sem permissão para uso offline.');
  return {
    version:8,
    sources:{'role-local-raster':{
      type:'raster',tiles:[`${OFFLINE_MAP_PROTOCOL}://${region.id}/{z}/{x}/{y}`],
      tileSize:256,minzoom:region.minZoom,maxzoom:region.maxZoom,
      bounds:[region.bounds.west,region.bounds.south,region.bounds.east,region.bounds.north],
      attribution:region.attribution
    }},
    layers:[{id:'role-local-raster',type:'raster',source:'role-local-raster'}]
  };
}

/** Read tiles only from IndexedDB. No HTTP fallback if a tile is unavailable. */
export async function readOfflineMapRequest(url:string,signal?:AbortSignal):Promise<ArrayBuffer>{
  const request=parseOfflineMapRequest(url);
  if(!request)throw Error('Endereço do tile offline inválido.');
  if(signal?.aborted)throw Error('Leitura do tile cancelada.');
  const region=await getOfflineRegion(request.regionId);
  if(!region||!offlineRegionReady(region)||!region.offlinePermissionConfirmed||
    !offlineTileBelongs(region,request.z,request.x,request.y))
    throw Error('Tile fora do pacote completo autorizado.');
  const tile=await loadOfflineTile(request.regionId,request.z,request.x,request.y);
  if(signal?.aborted)throw Error('Leitura do tile cancelada.');
  if(!tile)throw Error('Tile não encontrado no armazenamento local.');
  return tile.bytes;
}
let protocolInstalled=false;
/** The protocol is global to MapLibre; register only once per app process. */
export function registerOfflineMapProtocol():void{
  if(protocolInstalled)return;
  addProtocol(OFFLINE_MAP_PROTOCOL,async(parameters,abortController)=>{
    const bytes=await readOfflineMapRequest(parameters.url,abortController.signal);
    return {data:bytes};
  });
  protocolInstalled=true;
}

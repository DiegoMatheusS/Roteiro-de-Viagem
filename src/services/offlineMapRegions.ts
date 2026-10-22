/** Region geometry/limits for licensed, locally stored map tiles.
 * This module NEVER downloads tiles from public map providers.
 * A provider's permission must be verified independently before ingestion. */
export const OFFLINE_REGION_MAX_TILES=3000;
export const OFFLINE_REGION_MAX_BYTES=50_000_000;
export const OFFLINE_REGION_MAX_CONCURRENCY=4;
const MAX_LAT=85.05112878;
export type OfflineTileFormat='image/png'|'image/jpeg'|'image/webp';
export interface OfflineBounds {south:number;west:number;north:number;east:number}
export interface OfflineRegionDefinition {
  id:string;name:string;bounds:OfflineBounds;
  minZoom:number;maxZoom:number;
  /** Attribution displayed when rendering the package. */
  attribution:string;
  /** Identify the licensed source or independently imported pack. */
  sourceId:string;
  /** A download/import workflow must provide evidence of permission. */
  offlinePermissionConfirmed:boolean;
}
export interface OfflineRegion extends OfflineRegionDefinition {
  expectedTiles:number;savedTiles:number;sizeBytes:number;createdAt:number;
}
export type OfflineTile={regionId:string;z:number;x:number;y:number;mime:OfflineTileFormat;data:Blob;sizeBytes:number;key:string};
export interface OfflineTileRange {minX:number;maxX:number;minY:number;maxY:number;count:number}

function tileX(lon:number,z:number):number{
  const scale=2**z;
  return Math.max(0,Math.min(scale-1,Math.floor((lon+180)/360*scale)));
}
function tileY(lat:number,z:number):number {
  const radians=lat*Math.PI/180,scale=2**z;
  return Math.max(0,Math.min(scale-1,Math.floor(
    (1-Math.asinh(Math.tan(radians))/Math.PI)/2*scale
  )));
}
export function offlineTileRange(bounds:OfflineBounds,z:number):OfflineTileRange{
  const minX=tileX(bounds.west,z),maxX=tileX(bounds.east,z);
  const minY=tileY(bounds.north,z),maxY=tileY(bounds.south,z);
  return {minX,maxX,minY,maxY,count:(maxX-minX+1)*(maxY-minY+1)};
}
export function offlineRegionTileCount(bounds:OfflineBounds,minZoom:number,maxZoom:number):number {
  let count=0;
  for(let z=minZoom;z<=maxZoom;z++){
    count+=offlineTileRange(bounds,z).count;
    // Fail before creating huge lists for country-sized or high-zoom regions.
    if(count>OFFLINE_REGION_MAX_TILES)return count;
  }
  return count;
}
export function validateOfflineRegion(input:OfflineRegionDefinition):number{
  if(!input||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)||
     input.name.trim().length<1||input.name.trim().length>90)
    throw Error('Nome ou identificação da região inválidos.');
  if(!input.offlinePermissionConfirmed)
    throw Error('O provedor não autorizou o armazenamento offline desta região.');
  if(input.attribution.trim().length<3||input.attribution.length>250||
     !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.sourceId))
    throw Error('Origem ou atribuição do mapa inválida.');
  const {south,west,north,east}=input.bounds;
  if(![south,west,north,east].every(Number.isFinite)||
    south < -MAX_LAT||north > MAX_LAT||south>=north||
    west < -180||east > 180||west>=east)
    throw Error('Área inválida: use limites geográficos sem cruzar o antimeridiano.');
  if(!Number.isInteger(input.minZoom)||!Number.isInteger(input.maxZoom)||
    input.minZoom<0||input.maxZoom>17||input.minZoom>input.maxZoom)
    throw Error('Níveis de zoom inválidos para mapas offline.');
  const count=offlineRegionTileCount(input.bounds,input.minZoom,input.maxZoom);
  if(count===0||count>OFFLINE_REGION_MAX_TILES)
    throw Error('Região muito grande. Reduza a área ou os níveis de zoom (limite de 3.000 tiles).');
  return count;
}
export function offlineTileBelongs(region:OfflineRegion,z:number,x:number,y:number):boolean{
  if(![z,x,y].every(Number.isInteger)||z<region.minZoom||z>region.maxZoom)return false;
  const range=offlineTileRange(region.bounds,z);
  return x>=range.minX&&x<=range.maxX&&y>=range.minY&&y<=range.maxY;
}
export function offlineRegionReady(region:OfflineRegion):boolean {
  return region.expectedTiles>0&&region.savedTiles===region.expectedTiles&&
    region.sizeBytes>0&&region.sizeBytes<=OFFLINE_REGION_MAX_BYTES;
}
export function validOfflineTileBytes(mime:OfflineTileFormat,data:Uint8Array):boolean {
  if(data.byteLength<12||data.byteLength>OFFLINE_REGION_MAX_BYTES)return false;
  if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v);
  if(mime==='image/jpeg')return data[0]===255&&data[1]===216&&data[2]===255;
  if(mime==='image/webp')return [82,73,70,70].every((v,i)=>data[i]===v)&&
    [87,69,66,80].every((v,i)=>data[i+8]===v);
  return false;
}

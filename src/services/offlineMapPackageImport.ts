import {
  OFFLINE_REGION_MAX_BYTES,offlineTileBelongs,validateOfflineRegion,validOfflineTileBytes,
  type OfflineRegion,type OfflineRegionDefinition,type OfflineTileFormat
} from './offlineMapRegions';
import {deleteOfflineRegion,listOfflineRegions,registerOfflineRegion,storeOfflineTile} from './offlineMapStorage';

export const OFFLINE_PACKAGE_FORMAT='role-raster-region-v1';
export const OFFLINE_PACKAGE_MAX_FILE_BYTES=70_000_000;
export const OFFLINE_PACKAGE_MAX_TILE_BYTES=1_000_000;
export interface OfflinePackageTile {
  z:number;x:number;y:number;mime:OfflineTileFormat;dataBase64:string;
}
export interface OfflineMapPackage {
  format:typeof OFFLINE_PACKAGE_FORMAT;
  region:OfflineRegionDefinition;
  tiles:OfflinePackageTile[];
}
function decodedSize(value:string):number{
  return value.length/4*3-(value.endsWith('==')?2:value.endsWith('=')?1:0);
}
function base64Bytes(value:string):Uint8Array {
  const decoded=atob(value);
  return Uint8Array.from(decoded,char=>char.charCodeAt(0));
}
function isTile(value:unknown):value is OfflinePackageTile{
  if(!value||typeof value!=='object')return false;
  const tile=value as Record<string,unknown>;
  return Number.isInteger(tile.z)&&Number.isInteger(tile.x)&&Number.isInteger(tile.y)&&
    (tile.mime==='image/png'||tile.mime==='image/jpeg'||tile.mime==='image/webp')&&
    typeof tile.dataBase64==='string';
}
function isRegion(value:unknown):value is OfflineRegionDefinition {
  if(!value||typeof value!=='object')return false;
  const region=value as Record<string,unknown>;
  if(!region.bounds||typeof region.bounds!=='object')return false;
  const bounds=region.bounds as Record<string,unknown>;
  return typeof region.id==='string'&&typeof region.name==='string'&&
    typeof region.attribution==='string'&&typeof region.sourceId==='string'&&
    region.offlinePermissionConfirmed===true&&
    typeof region.minZoom==='number'&&typeof region.maxZoom==='number'&&
    [bounds.south,bounds.west,bounds.north,bounds.east].every(n=>typeof n==='number');
}
/** Parse only a user-chosen local package. No URLs or remote tile requests. */
export function parseOfflineMapPackage(raw:string):OfflineMapPackage {
  if(raw.length>OFFLINE_PACKAGE_MAX_FILE_BYTES)throw Error('Pacote maior que 70 MB.');
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw Error('O arquivo não é um pacote JSON de mapas válido.');}
  if(!parsed||typeof parsed!=='object')throw Error('Formato de pacote não reconhecido.');
  const data=parsed as Record<string,unknown>;
  if(data.format!==OFFLINE_PACKAGE_FORMAT||!isRegion(data.region)||!Array.isArray(data.tiles))
    throw Error('Formato do pacote ou atribuição/permissão de origem inválidos.');
  const region=data.region;
  const count=validateOfflineRegion(region);
  if(data.tiles.length!==count)
    throw Error('O pacote está incompleto: quantidade de tiles diferente da cobertura declarada.');
  const manifest:OfflineRegion={...region,expectedTiles:count,savedTiles:0,sizeBytes:0,createdAt:0};
  const seen=new Set<string>();
  let total=0;
  const tiles:OfflinePackageTile[]=[];
  for(const rawTile of data.tiles){
    if(!isTile(rawTile)||!offlineTileBelongs(manifest,rawTile.z,rawTile.x,rawTile.y))
      throw Error('Tile fora dos limites ou com formato inválido.');
    const encoded=rawTile.dataBase64;
    if(encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw Error('Tile com base64 inválido.');
    const size=decodedSize(encoded);
    if(size<12||size>OFFLINE_PACKAGE_MAX_TILE_BYTES)
      throw Error('Tile com tamanho fora do limite de 1 MB.');
    const key=[rawTile.z,rawTile.x,rawTile.y].join('/');
    if(seen.has(key))throw Error('Pacote contém tiles duplicados.');
    seen.add(key);total+=size;
    if(total>OFFLINE_REGION_MAX_BYTES)throw Error('Pacote excede 50 MB por região.');
    // Decode just the signature in validation pass, before any IndexedDB mutation.
    const magic=base64Bytes(encoded.slice(0,Math.ceil(16/3)*4));
    if(!validOfflineTileBytes(rawTile.mime,magic))
      throw Error('O pacote contém um tile que não corresponde ao formato declarado.');
    tiles.push(rawTile);
  }
  return {format:OFFLINE_PACKAGE_FORMAT,region,tiles};
}
/** Fail closed on duplicates or quota errors and roll back imported data. */
export async function importOfflineMapPackage(
  file:File,onProgress?:(done:number,total:number)=>void
):Promise<OfflineRegion>{
  if(file.size>OFFLINE_PACKAGE_MAX_FILE_BYTES)
    throw Error('Arquivo maior que 70 MB: selecione uma região menor.');
  const payload=parseOfflineMapPackage(await file.text());
  const exists=(await listOfflineRegions()).some(region=>region.id===payload.region.id);
  if(exists)throw Error('Já existe uma região com este identificador. Remova a anterior primeiro.');
  let created=false;
  try{
    await registerOfflineRegion(payload.region);
    created=true;
    let last:OfflineRegion|null=null;
    for(let index=0;index<payload.tiles.length;index++){
      const tile=payload.tiles[index];
      const bytes=base64Bytes(tile.dataBase64);
      if(!validOfflineTileBytes(tile.mime,bytes))
        throw Error('O pacote contém um tile corrompido.');
      last=await storeOfflineTile({
        regionId:payload.region.id,z:tile.z,x:tile.x,y:tile.y,mime:tile.mime,bytes
      });
      onProgress?.(index+1,payload.tiles.length);
    }
    if(!last||last.savedTiles!==last.expectedTiles)
      throw Error('Pacote incompleto após a gravação.');
    return last;
  }catch(error){
    if(created){
      try{await deleteOfflineRegion(payload.region.id);}
      catch{throw Error('Importação falhou e a limpeza automática não terminou. Exclua a região incompleta em Configurações.');}
    }
    throw error;
  }
}

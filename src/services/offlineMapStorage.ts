import {
  OFFLINE_REGION_MAX_BYTES,offlineTileBelongs,validateOfflineRegion,validOfflineTileBytes,
  type OfflineRegion,type OfflineRegionDefinition,type OfflineTile,type OfflineTileFormat
} from './offlineMapRegions';

const DB_NAME='role-offline-map-regions-v1';
const REGIONS='regions',TILES='tiles',MAX_REGIONS=4;

function requestValue<T>(request:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Falha ao acessar o mapa armazenado.'));
  });
}
function transactionEnd(transaction:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error||Error('Erro ao salvar a região offline.'));
    transaction.onabort=()=>reject(transaction.error||Error('Gravação do mapa cancelada.'));
  });
}
function safelyAbort(tx:IDBTransaction):void{
  try{tx.abort();}catch{/* Transaction may already be completed. */}
}
function openDb():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')
    return Promise.reject(Error('Armazenamento persistente de mapas indisponível neste aparelho.'));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const fail=(reason:Error)=>{if(!settled){settled=true;reject(reason);}};
    let pending:IDBOpenDBRequest;
    try{pending=indexedDB.open(DB_NAME,1);}
    catch(error){fail(error instanceof Error?error:Error('Não foi possível abrir o armazenamento.'));return;}
    pending.onupgradeneeded=()=>{
      const db=pending.result;
      if(!db.objectStoreNames.contains(REGIONS))db.createObjectStore(REGIONS,{keyPath:'id'});
      if(!db.objectStoreNames.contains(TILES)){
        const tiles=db.createObjectStore(TILES,{keyPath:'key'});
        tiles.createIndex('regionId','regionId');
      }
    };
    pending.onsuccess=()=>{
      if(settled){pending.result.close();return;}
      settled=true;resolve(pending.result);
    };
    pending.onerror=()=>fail(pending.error||Error('Falha no armazenamento offline.'));
    pending.onblocked=()=>fail(Error('Armazenamento offline bloqueado por outra sessão.'));
  });
}
async function usingDb<T>(action:(db:IDBDatabase)=>Promise<T>):Promise<T>{
  const db=await openDb();
  try{return await action(db);}finally{db.close();}
}
function tileKey(id:string,z:number,x:number,y:number):string{return [id,z,x,y].join('/');}

/** Creates a manifest, not a download. No calls to OSM/OpenFreeMap/Esri/etc. */
export async function registerOfflineRegion(definition:OfflineRegionDefinition):Promise<OfflineRegion>{
  const expectedTiles=validateOfflineRegion(definition);
  return usingDb(async db=>{
    const tx=db.transaction(REGIONS,'readwrite'),done=transactionEnd(tx);
    try{
      const regions=tx.objectStore(REGIONS);
      const existing=await requestValue(regions.getAll() as IDBRequest<OfflineRegion[]>);
      if(existing.length>=MAX_REGIONS)throw Error('Limite de quatro regiões no aparelho.');
      if(existing.some(region=>region.id===definition.id))throw Error('Já existe uma região com este identificador.');
      const record:OfflineRegion={...definition,bounds:{...definition.bounds},expectedTiles,
        savedTiles:0,sizeBytes:0,createdAt:Date.now()};
      await requestValue(regions.add(record));
      await done;
      return record;
    }catch(error){safelyAbort(tx);void done.catch(()=>{});throw error;}
  });
}
export async function listOfflineRegions():Promise<OfflineRegion[]>{
  return usingDb(async db=>{
    const tx=db.transaction(REGIONS,'readonly'),done=transactionEnd(tx);
    const records=await requestValue(tx.objectStore(REGIONS).getAll() as IDBRequest<OfflineRegion[]>);
    await done;return records.sort((a,b)=>b.createdAt-a.createdAt);
  });
}
export async function getOfflineRegion(id:string):Promise<OfflineRegion|null>{
  return usingDb(async db=>{
    const tx=db.transaction(REGIONS,'readonly'),done=transactionEnd(tx);
    const value=await requestValue(tx.objectStore(REGIONS).get(id) as IDBRequest<OfflineRegion|undefined>);
    await done;return value??null;
  });
}
/** Accepts only separately licensed/supplied image data: does NOT prefetch or
 * download public tiles. Counters and tile are committed atomically. */
export async function storeOfflineTile(input:{
  regionId:string;z:number;x:number;y:number;mime:OfflineTileFormat;bytes:Uint8Array
}):Promise<OfflineRegion>{
  const {regionId,z,x,y,mime,bytes}=input;
  if(!validOfflineTileBytes(mime,bytes))throw Error('Tile inválido ou imagem excede o limite permitido.');
  return usingDb(async db=>{
    const tx=db.transaction([REGIONS,TILES],'readwrite'),done=transactionEnd(tx);
    try{
      const regions=tx.objectStore(REGIONS),tiles=tx.objectStore(TILES);
      const region=await requestValue(regions.get(regionId) as IDBRequest<OfflineRegion|undefined>);
      if(!region||!offlineTileBelongs(region,z,x,y))
        throw Error('Tile fora da região autorizada ou região inexistente.');
      const key=tileKey(regionId,z,x,y);
      const existing=await requestValue(tiles.get(key) as IDBRequest<OfflineTile|undefined>);
      const nextBytes=region.sizeBytes-(existing?.sizeBytes||0)+bytes.byteLength;
      const nextTiles=region.savedTiles+(existing?0:1);
      if(nextBytes>OFFLINE_REGION_MAX_BYTES||nextTiles>region.expectedTiles)
        throw Error('Limite de armazenamento por região excedido.');
      const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);
      const record:OfflineTile={key,regionId,z,x,y,mime,sizeBytes:bytes.byteLength,
        data:new Blob([copy],{type:mime})};
      const updated:OfflineRegion={...region,savedTiles:nextTiles,sizeBytes:nextBytes};
      await requestValue(tiles.put(record));
      await requestValue(regions.put(updated));
      await done;
      return updated;
    }catch(error){safelyAbort(tx);void done.catch(()=>{});throw error;}
  });
}
export async function loadOfflineTile(regionId:string,z:number,x:number,y:number):Promise<{
  mime:OfflineTileFormat;bytes:ArrayBuffer
}|null>{
  return usingDb(async db=>{
    const tx=db.transaction(TILES,'readonly'),done=transactionEnd(tx);
    const tile=await requestValue(tx.objectStore(TILES).get(tileKey(regionId,z,x,y)) as IDBRequest<OfflineTile|undefined>);
    await done;
    return tile?{mime:tile.mime,bytes:await tile.data.arrayBuffer()}:null;
  });
}
export async function deleteOfflineRegion(id:string):Promise<void>{
  return usingDb(async db=>{
    const tx=db.transaction([REGIONS,TILES],'readwrite'),done=transactionEnd(tx);
    try{
      const regions=tx.objectStore(REGIONS),tiles=tx.objectStore(TILES);
      const index=tiles.index('regionId');
      await new Promise<void>((resolve,reject)=>{
        const cursor=index.openCursor(IDBKeyRange.only(id));
        cursor.onerror=()=>reject(cursor.error||Error('Falha ao liberar espaço da região.'));
        cursor.onsuccess=()=>{
          const item=cursor.result;
          if(!item){resolve();return;}
          item.delete();item.continue();
        };
      });
      await requestValue(regions.delete(id));
      await done;
    }catch(error){safelyAbort(tx);void done.catch(()=>{});throw error;}
  });
}

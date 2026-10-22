import {getOfflineRegion} from './offlineMapStorage';
import {roadDistanceMeters,validateOfflineRoadGraph,ROAD_GRAPH_MAX_BYTES,
  type OfflineRoadGraph,type RoadPoint} from './offlineRoadGraph';

const DB_NAME='role-offline-roads-v1';
const TABLE='graphs';
function requestValue<T>(request:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Falha de leitura da rede viária offline.'));
  });
}
function opened():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')return Promise.reject(Error('IndexedDB indisponível.'));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(TABLE))
        req.result.createObjectStore(TABLE,{keyPath:'regionId'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Banco de ruas offline indisponível.'));
  });
}
async function transaction<T>(
  mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>
):Promise<T>{
  const db=await opened();
  try{
    const tx=db.transaction(TABLE,mode),request=fn(tx.objectStore(TABLE));
    const complete=new Promise<void>((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('Operação de rede viária cancelada.'));
      tx.onerror=()=>reject(tx.error||Error('Erro de armazenamento de ruas.'));
    });
    const result=await requestValue(request);
    await complete;
    return result;
  }finally{db.close();}
}
export async function importOfflineRoadGraph(file:File):Promise<OfflineRoadGraph>{
  if(file.size>ROAD_GRAPH_MAX_BYTES)throw Error('Arquivo de rede viária acima de 8 MB.');
  const raw=await file.text();
  if(raw.length>ROAD_GRAPH_MAX_BYTES)throw Error('Arquivo de rede viária acima de 8 MB.');
  let value:unknown;
  try{value=JSON.parse(raw);}catch{throw Error('Arquivo JSON de rede viária inválido.');}
  if(!value||typeof value!=='object'||typeof (value as {regionId?:unknown}).regionId!=='string')
    throw Error('Região de ruas inválida.');
  const id=(value as {regionId:string}).regionId;
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('Identificador de região inválido.');
  const region=await getOfflineRegion(id);
  if(!region||!region.offlinePermissionConfirmed)
    throw Error('Importe primeiro um mapa licenciado dessa região.');
  const graph=validateOfflineRoadGraph(value,region.bounds);
  await transaction('readwrite',store=>store.put(graph));
  return graph;
}
export async function deleteOfflineRoadGraph(regionId:string):Promise<void>{
  await transaction('readwrite',store=>store.delete(regionId));
}
export async function loadOfflineRoadGraph(regionId:string):Promise<OfflineRoadGraph|null>{
  const graph=await transaction<OfflineRoadGraph|undefined>('readonly',
    store=>store.get(regionId));
  if(!graph)return null;
  const region=await getOfflineRegion(regionId);
  if(!region||!region.offlinePermissionConfirmed)return null;
  // Revalidate persisted data and geographic scope; never trust stale storage.
  return validateOfflineRoadGraph(graph,region.bounds);
}
export async function listOfflineRoadGraphs():Promise<OfflineRoadGraph[]>{
  const graphs=await transaction<OfflineRoadGraph[]>('readonly',store=>store.getAll());
  const valid:OfflineRoadGraph[]=[];
  for(const graph of graphs){
    try{
      const region=await getOfflineRegion(graph.regionId);
      if(region?.offlinePermissionConfirmed)
        valid.push(validateOfflineRoadGraph(graph,region.bounds));
    }catch{/* Invalid/stale packs are not offered for navigation. */}
  }
  return valid;
}
export async function findOfflineRoadGraph(
  locations:readonly RoadPoint[]
):Promise<OfflineRoadGraph|null>{
  const graphs=await listOfflineRoadGraphs();
  for(const graph of graphs){
    const region=await getOfflineRegion(graph.regionId);
    if(!region)continue;
    const covers=locations.every(([lat,lon])=>
      Number.isFinite(lat)&&Number.isFinite(lon)&&
      lat>=region.bounds.south&&lat<=region.bounds.north&&
      lon>=region.bounds.west&&lon<=region.bounds.east);
    if(covers && locations.every(p=>graph.nodes.some(n=>
      roadDistanceMeters(n.coords,p)<=75)))return graph;
  }
  return null;
}

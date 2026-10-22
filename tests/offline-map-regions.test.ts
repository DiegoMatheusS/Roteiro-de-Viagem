import test from 'node:test';
import assert from 'node:assert/strict';
import {
 OFFLINE_REGION_MAX_BYTES,OFFLINE_REGION_MAX_TILES,OFFLINE_REGION_MAX_CONCURRENCY,
 offlineTileRange,offlineRegionTileCount,offlineTileBelongs,
 offlineRegionReady,validateOfflineRegion,validOfflineTileBytes,
 type OfflineRegionDefinition,type OfflineRegion
} from '../src/services/offlineMapRegions';
import {readFileSync} from 'node:fs';
const small:OfflineRegionDefinition={
 id:'sao-paulo-centro',name:'São Paulo · centro',
 bounds:{south:-23.551,west:-46.635,north:-23.548,east:-46.632},
 minZoom:13,maxZoom:15,
 sourceId:'licensed-offline-provider',attribution:'© dados e mapa licenciados',
 offlinePermissionConfirmed:true
};
function record(spec=small):OfflineRegion {
 const expectedTiles=validateOfflineRegion(spec);
 return {...spec,expectedTiles,savedTiles:0,sizeBytes:0,createdAt:1};
}
test('conta tiles somente na área autorizada e nos níveis selecionados',()=>{
 const count=validateOfflineRegion(small);
 assert.ok(count>0&&count<=OFFLINE_REGION_MAX_TILES);
 let calculated=0;
 for(let z=small.minZoom;z<=small.maxZoom;z++){
  const r=offlineTileRange(small.bounds,z);
  assert.equal(r.count,(r.maxX-r.minX+1)*(r.maxY-r.minY+1));
  calculated+=r.count;
 }
 assert.equal(count,calculated);
 assert.equal(offlineRegionTileCount(small.bounds,small.minZoom,small.maxZoom),count);
 assert.equal(OFFLINE_REGION_MAX_CONCURRENCY,4);
 assert.equal(OFFLINE_REGION_MAX_BYTES,52428800);
});

test('recusa regiões amplas, coordenadas inválidas e permissão ausente',()=>{
 assert.throws(()=>validateOfflineRegion({...small,offlinePermissionConfirmed:false}),/não autorizou/);
 assert.throws(()=>validateOfflineRegion({...small,bounds:{south:-40,west:-60,north:10,east:-30},
   minZoom:11,maxZoom:17}),/Região muito grande/);
 assert.throws(()=>validateOfflineRegion({...small,bounds:{south:-10,west:170,north:10,east:-170}}),/Área inválida/);
 assert.throws(()=>validateOfflineRegion({...small,bounds:{south:-91,west:-50,north:10,east:0}}),/Área inválida/);
 assert.throws(()=>validateOfflineRegion({...small,bounds:{south:-24,west:NaN,north:-23,east:-46}}),/Área inválida/);
 assert.throws(()=>validateOfflineRegion({...small,minZoom:12,maxZoom:18}),/Níveis de zoom/);
 assert.throws(()=>validateOfflineRegion({...small,id:'../escape'}),/identificação/);
 assert.throws(()=>validateOfflineRegion({...small,attribution:''}),/atribuição/);
});
test('cada tile deve pertencer ao polígono de cobertura e zoom do pacote',()=>{
 const region=record();
 const inBounds=offlineTileRange(region.bounds,14);
 assert.equal(offlineTileBelongs(region,14,inBounds.minX,inBounds.minY),true);
 assert.equal(offlineTileBelongs(region,14,inBounds.maxX+1,inBounds.minY),false);
 assert.equal(offlineTileBelongs(region,14,inBounds.minX,-1),false);
 assert.equal(offlineTileBelongs(region,18,inBounds.minX,inBounds.minY),false);
 assert.equal(offlineTileBelongs(region,14,NaN,inBounds.minY),false);
 assert.equal(offlineTileBelongs(region,14,inBounds.minX+.5,inBounds.minY),false);
});
test('nenhum pacote incompleto ou vazio é anunciado como pronto para uso offline',()=>{
 const r=record();
 assert.equal(offlineRegionReady(r),false);
 assert.equal(offlineRegionReady({...r,savedTiles:r.expectedTiles,sizeBytes:2048}),true);
 assert.equal(offlineRegionReady({...r,savedTiles:r.expectedTiles-1,sizeBytes:2048}),false);
 assert.equal(offlineRegionReady({...r,savedTiles:r.expectedTiles,sizeBytes:OFFLINE_REGION_MAX_BYTES+1}),false);
});
test('somente PNG, JPEG ou WEBP verdadeiros: não armazenar HTML nem resposta de erro como tile',()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 const jpeg=new Uint8Array([255,216,255,224,0,1,2,3,4,5,6,7]);
 const webp=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]);
 assert.equal(validOfflineTileBytes('image/png',png),true);
 assert.equal(validOfflineTileBytes('image/jpeg',jpeg),true);
 assert.equal(validOfflineTileBytes('image/webp',webp),true);
 assert.equal(validOfflineTileBytes('image/png',new TextEncoder().encode('<html>erro de rede</html>')),false);
 assert.equal(validOfflineTileBytes('image/png',jpeg),false);
 assert.equal(validOfflineTileBytes('image/png',new Uint8Array(0)),false);
 assert.equal(validOfflineTileBytes('image/png',new Uint8Array(OFFLINE_REGION_MAX_BYTES+1)),false);
});
test('persistência offline não busca nem baixa automaticamente tiles públicos',()=>{
 const storage=readFileSync(new URL('../src/services/offlineMapStorage.ts',import.meta.url),'utf8');
 assert.match(storage,/indexedDB\.open\(DB_NAME,1\)/);
 assert.match(storage,/offlineTileBelongs\(region,z,x,y\)/);
 assert.match(storage,/offlineRegionReady|storeOfflineTile/);
 assert.match(storage,/index\.openCursor\(IDBKeyRange\.only\(id\)\)/);
 assert.doesNotMatch(storage,/fetch\(|XMLHttpRequest|https?:\/\/|tile\.openstreetmap\.org/i);
});

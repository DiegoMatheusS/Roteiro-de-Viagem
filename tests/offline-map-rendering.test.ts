import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseOfflineMapRequest,offlineRasterStyle,readOfflineMapRequest} from '../src/services/offlineMapLibre';
import {offlineRegionContains,usableOfflineRegion,OFFLINE_REGION_CHOICE_KEY} from '../src/services/offlineMapSelection';
import type {OfflineRegion} from '../src/services/offlineMapRegions';

const saved:OfflineRegion={
 id:'local-001',name:'Região de teste',sourceId:'licensed-provider',
 attribution:'© Fonte com permissão offline',
 offlinePermissionConfirmed:true,
 bounds:{south:-23.56,west:-46.64,north:-23.54,east:-46.62},
 minZoom:12,maxZoom:13,expectedTiles:2,savedTiles:2,sizeBytes:2400,createdAt:1
};
test('MapLibre utiliza protocolo interno e atribuição do pacote, sem URL externa',()=>{
 const style=offlineRasterStyle(saved);
 assert.equal(style.version,8);
 const source=style.sources['role-local-raster'];
 assert.equal(source.type,'raster');
 if(source.type!=='raster')throw Error('raster required');
 assert.deepEqual(source.tiles,['role-offline://local-001/{z}/{x}/{y}']);
 assert.equal(source.tileSize,256);
 assert.equal(source.minzoom,12);
 assert.equal(source.maxzoom,13);
 assert.deepEqual(source.bounds,[-46.64,-23.56,-46.62,-23.54]);
 assert.equal(source.attribution,'© Fonte com permissão offline');
 assert.equal(style.layers.length,1);
 assert.equal(style.layers[0].id,'role-local-raster');
});
test('URLs internas aceitam somente id e tile XYZ válidos',()=>{
 assert.deepEqual(parseOfflineMapRequest('role-offline://local-001/12/1200/1600'),
   {regionId:'local-001',z:12,x:1200,y:1600});
 for(const url of ['https://tile.openstreetmap.org/12/1200/1600',
   'role-offline://../12/1200/1600','role-offline://local-001/12/1200/99999',
   'role-offline://local-001/20/0/0','role-offline://local-001/4/-1/3',
   'role-offline://local-001/3/4/3.png','role-offline://local-001/12/1/1?redirect=https://example.com',
   'role-offline://local-001/12/1.2/1'])
   assert.equal(parseOfflineMapRequest(url),null,url);
});
test('pacotes incompletos, sem licença ou fora da cobertura nunca aparecem como disponíveis',()=>{
 assert.equal(usableOfflineRegion([saved],'local-001')?.id,'local-001');
 assert.equal(usableOfflineRegion([saved],'unknown'),null);
 assert.equal(usableOfflineRegion([{...saved,savedTiles:1}],'local-001'),null);
 assert.equal(usableOfflineRegion([{...saved,offlinePermissionConfirmed:false}],'local-001'),null);
 assert.equal(offlineRegionContains(saved,[-23.55,-46.63]),true);
 assert.equal(offlineRegionContains(saved,[-23.55,-47.63]),false);
 assert.equal(offlineRegionContains(saved,[NaN,-46.63]),false);
 assert.throws(()=>offlineRasterStyle({...saved,savedTiles:1}),/incompleto/);
 assert.throws(()=>offlineRasterStyle({...saved,offlinePermissionConfirmed:false}),/permissão/);
 assert.equal(OFFLINE_REGION_CHOICE_KEY,'role:offline-map-selected:v1');
});
test('endereço inválido não alcança IndexedDB nem realiza requisição HTTP',async()=>{
 await assert.rejects(readOfflineMapRequest('https://example.com/tile'),/inválido/);
 const source=readFileSync(new URL('../src/services/offlineMapLibre.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\(|XMLHttpRequest|https?:\/\//);
 assert.match(source,/await loadOfflineTile\(/);
 assert.match(source,/abortController.signal/);
 const native=readFileSync(new URL('../src/components/StandaloneNavigationMap.tsx',import.meta.url),'utf8');
 assert.match(native,/registerOfflineMapProtocol\(\)/);
 assert.match(native,/offlineRasterStyle\(region\)/);
 assert.match(native,/setOfflineRegion:region=>/);
 assert.match(native,/data-map-offline-region=/);
 assert.match(native,/Sem internet · novas áreas do mapa e rotas podem não carregar/);
 assert.match(native,/Missing local tiles must never force online Leaflet\/OSM fallback/);
});

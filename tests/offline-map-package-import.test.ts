import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseOfflineMapPackage,OFFLINE_PACKAGE_FORMAT,OFFLINE_PACKAGE_MAX_FILE_BYTES,
  OFFLINE_PACKAGE_MAX_TILE_BYTES
} from '../src/services/offlineMapPackageImport';

const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64');
const jpeg=Buffer.from([255,216,255,0,1,2,3,4,5,6,7,8]).toString('base64');
const region={
  id:'pacote-licenciado',name:'Mapa licenciado local',
  bounds:{south:-23.5501,west:-46.6331,north:-23.5500,east:-46.6330},
  minZoom:0,maxZoom:0,sourceId:'licensed-pack',attribution:'© Provedor licenciado',
  offlinePermissionConfirmed:true
};
const tile={z:0,x:0,y:0,mime:'image/png',dataBase64:png};
function payload(overrides:Record<string,unknown>={}){
  return JSON.stringify({format:OFFLINE_PACKAGE_FORMAT,region,tiles:[tile],...overrides});
}
test('importador aceita região completa local, atribuição e PNG válido',()=>{
  const parsed=parseOfflineMapPackage(payload());
  assert.equal(parsed.region.id,'pacote-licenciado');
  assert.equal(parsed.region.offlinePermissionConfirmed,true);
  assert.equal(parsed.tiles.length,1);
  assert.equal(parsed.tiles[0].dataBase64,png);
  assert.equal(OFFLINE_PACKAGE_MAX_FILE_BYTES,70_000_000);
  assert.equal(OFFLINE_PACKAGE_MAX_TILE_BYTES,1_000_000);
});
test('não importa cobertura incompleta ou tiles duplicados',()=>{
  assert.throws(()=>parseOfflineMapPackage(payload({tiles:[]})),/incompleto/);
  const twoLevels={...region,maxZoom:1};
  assert.throws(()=>parseOfflineMapPackage(payload({region:twoLevels,tiles:[tile]})),/incompleto/);
  assert.throws(()=>parseOfflineMapPackage(payload({region:twoLevels,tiles:[tile,tile]})),/incompleto|duplicados/);
});
test('recusa tiles fora da área, assinatura falsa, origem sem autorização e base64 inválida',()=>{
  assert.throws(()=>parseOfflineMapPackage(payload({tiles:[{...tile,x:2}]})),/fora dos limites/);
  assert.throws(()=>parseOfflineMapPackage(payload({tiles:[{...tile,dataBase64:'aGVsbG8gYnJvd3NlciE='}]})),/não corresponde/);
  assert.throws(()=>parseOfflineMapPackage(payload({tiles:[{...tile,dataBase64:'!!!='}]})),/base64 inválido/);
  assert.throws(()=>parseOfflineMapPackage(payload({region:{...region,offlinePermissionConfirmed:false}})),/permissão/);
  assert.throws(()=>parseOfflineMapPackage(payload({region:{...region,attribution:''}})),/atribuição/);
  assert.throws(()=>parseOfflineMapPackage(payload({tiles:[{...tile,mime:'image/jpeg',dataBase64:png}]})),/não corresponde/);
  const validJpeg=parseOfflineMapPackage(payload({tiles:[{...tile,mime:'image/jpeg',dataBase64:jpeg}]}));
  assert.equal(validJpeg.tiles[0].mime,'image/jpeg');
  assert.throws(()=>parseOfflineMapPackage('<html>erro</html>'),/JSON/);
});
test('não suporta pacotes não autorizados nem URLs remotas de prefetch',()=>{
  assert.throws(()=>parseOfflineMapPackage(JSON.stringify({format:'mbtiles',region,tiles:[tile]})),/Formato do pacote/);
  const importer=readFileSync(new URL('../src/services/offlineMapPackageImport.ts',import.meta.url),'utf8');
  assert.doesNotMatch(importer,/fetch\(|XMLHttpRequest|https?:\/\/|window\.location/);
  assert.match(importer,/await deleteOfflineRegion\(payload.region.id\)/);
  assert.match(importer,/await storeOfflineTile/);
  const panel=readFileSync(new URL('../src/components/OfflineRegionsPanel.tsx',import.meta.url),'utf8');
  assert.match(panel,/Confirmo que o pacote foi obtido legalmente/);
  assert.match(panel,/Mapa local completo \(disponível nas camadas\)/);
  assert.match(panel,/deleteOfflineRegion\(item.id\)/);
  const settings=readFileSync(new URL('../src/components/ProfileAndSettingsTab.tsx',import.meta.url),'utf8');
  assert.match(settings,/<OfflineRegionsPanel \/>/);
});

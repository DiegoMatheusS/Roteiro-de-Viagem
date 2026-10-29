import test from 'node:test';
import assert from 'node:assert/strict';
import {poiAccent,poiVisibleAtZoom,poiDistanceMeters,nearestPoiToExpand,
 resolvePoiPreview,EMPTY_POI_PREVIEW,POI_AUTO_PREVIEW_MS} from '../src/services/mapPoiPresentation';
import type {RoleVectorMarker} from '../src/services/vectorPlaceData';

const place=(id:string,coords:[number,number],category:'restaurant'|'waterfall'='restaurant'):RoleVectorMarker=>
 ({kind:'place',id,coords,name:id,description:'Local cadastrado',category});
test('ícones carregados permanecem visíveis em todas as escalas de zoom válidas',()=>{
 assert.equal(poiAccent('fuel'),'#2563eb');
 assert.equal(poiAccent('hotel'),'#7c3aed');
 assert.equal(poiAccent('waterfall'),'#15803d');
 for(const zoom of [0,4,8,9,11,14,16,19]){
  for(const marker of [place('turismo',[-23,-46],'waterfall'),place('resto',[-23,-46]),
   {kind:'fuel' as const,id:'1',name:'Posto',coords:[-23,-46] as [number,number],priceLabel:null},
   {...place('admin:local',[-23,-46]),managed:true}])
   assert.equal(poiVisibleAtZoom(marker,zoom),true,'pin stays at zoom '+zoom);
 }
 assert.equal(poiVisibleAtZoom(place('a',[-23,-46]),Number.NaN),false);
});
test('apenas o local mais perto abre quando o GPS é confiável',()=>{
 const pins=[place('a',[-23,-46]),place('b',[-23.0005,-46])];
 const input={zoom:16,navigationMode:true,location:[-23,-46] as [number,number],accuracyMeters:8};
 assert.equal(nearestPoiToExpand(pins,input),'place:a');
 assert.equal(nearestPoiToExpand(pins,{...input,accuracyMeters:70}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,zoom:12}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,navigationMode:false}),null);
 assert.equal(nearestPoiToExpand(pins,{...input,location:[-24,-47]}),null);
 assert.ok(poiDistanceMeters([-23,-46],[-23.0005,-46])>50);
});

test('cartão por aproximação expande uma vez por seis segundos sem reiniciar a cada GPS',()=>{
 const opened=resolvePoiPreview(EMPTY_POI_PREVIEW,'place:resto',1000);
 assert.equal(POI_AUTO_PREVIEW_MS,6000);
 assert.equal(opened.expandedKey,'place:resto');
 assert.equal(opened.remainingMs,6000);
 const refreshed=resolvePoiPreview(opened.state,'place:resto',4500);
 assert.equal(refreshed.expandedKey,'place:resto');
 assert.equal(refreshed.remainingMs,2500);
 const finished=resolvePoiPreview(refreshed.state,'place:resto',7000);
 assert.equal(finished.expandedKey,null);
 assert.equal(finished.remainingMs,null);
 assert.equal(resolvePoiPreview(finished.state,'place:resto',15000).expandedKey,null,
  'Parado ao lado do local não deve reabrir um cartão continuamente');
 const away=resolvePoiPreview(finished.state,null,16000);
 assert.equal(away.state.nearbyKey,null);
 assert.equal(resolvePoiPreview(away.state,'place:resto',17000).expandedKey,'place:resto',
  'Sair e se aproximar novamente pode apresentar o local outra vez');
});
test('cartão mais próximo pode substituir o anterior, e contexto inválido não abre popups',()=>{
 const first=resolvePoiPreview(EMPTY_POI_PREVIEW,'place:a',1000);
 assert.equal(resolvePoiPreview(first.state,'place:b',2000).expandedKey,'place:b');
 assert.equal(resolvePoiPreview(first.state,null,2200).expandedKey,null);
 assert.equal(resolvePoiPreview(first.state,'place:a',NaN).expandedKey,null);
});

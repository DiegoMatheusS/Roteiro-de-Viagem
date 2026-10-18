import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectVisibleRoadAlerts,roadAlertMarkerChange} from '../src/services/mapRoadAlerts';
import type {RoadAlert} from '../src/types/roadAlerts';

const now = Date.parse('2026-10-17T21:00:00Z');
const good: RoadAlert = {
  id:'approved-1', kind:'pothole', lat:-23.55,lng:-46.63,
  note:'Ocorrência confirmada',createdAt:'2026-10-17T20:00:00Z',
  expiresAt:'2026-10-18T22:00:00Z'
};
test('somente alertas válidos, conhecidos e não vencidos vão ao mapa',()=>{
  const input:RoadAlert[]=[
    good, {...good}, {...good,id:'expired',expiresAt:'2026-10-16T12:00:00Z'},
    {...good,id:'pending',status:'pending'},
    {...good,id:'rejected',status:'rejected'},
    {...good,id:'badpos',lat:Infinity},
    {...good,id:'badlng',lng:-220},
    {...good,id:'badkind',kind:'new_unapproved_type' as RoadAlert['kind']},
    {...good,id:'flood',kind:'flooded_road',status:'approved'}
  ];
  assert.deepEqual(selectVisibleRoadAlerts(input,now).map(item=>item.id),['approved-1','flood']);
  assert.deepEqual(selectVisibleRoadAlerts([good],Date.parse(good.expiresAt)),[]);
});
test('renderer nativo preserva acesso por teclado e confirmação no mesmo modal',()=>{
  const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const ui=read('src/components/InteractiveMap.tsx');
  const renderer=read('src/services/mapLibreRoadAlertMarkers.ts');
  const icons=read('src/services/mapRoadAlerts.ts');
  assert.match(ui,/selectVisibleRoadAlerts\(roadAlerts\)/);
  assert.match(ui,/L\.marker\(\[alert\.lat,alert\.lng\]/);
  assert.match(ui,/createRoleMaplibreRoadAlertController\(gl,/);
  assert.match(ui,/roadAlertGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(ui,/setVectorAlertsReady\(false\)/);
  assert.match(ui,/setVectorAlertsReady\(true\)/);
  assert.match(ui,/setSelectedRoadAlert\(alert\)/);
  assert.match(ui,/Ainda continua lá\?/);
  assert.match(renderer,/new Marker\(\{element:button,anchor:'center'\}\)/);
  assert.match(renderer,/setLngLat\(\[alert\.lng,alert\.lat\]\)/);
  assert.match(renderer,/button\.setAttribute\('aria-label'/);
  assert.match(renderer,/button\.addEventListener\('click'/);
  assert.match(renderer,/marker\.remove\(\)/);
  assert.doesNotMatch(icons,/alert\.note\s*\+/);
  assert.doesNotMatch(icons,/sourceUrl\s*\+/);
});

test('ocorrência aprovada mantém o mesmo marcador quando só texto ou validade mudam',()=>{
  assert.equal(roadAlertMarkerChange(null,good),'create');
  const updatedReport:RoadAlert={...good,note:'Nova confirmação',expiresAt:'2026-10-19T00:00:00Z'};
  assert.equal(roadAlertMarkerChange(good,updatedReport),'keep');
  assert.equal(roadAlertMarkerChange(good,{...good,lat:-23.54}),'move');
  assert.equal(roadAlertMarkerChange(good,{...good,kind:'flooded_road'}),'replace');
});
test('validade, moderação e duplicidade determinam quais alertas desaparecem',()=>{
  const unapproved={...good,status:'pending' as const};
  const expired={...good,expiresAt:'2026-10-17T20:01:00Z'};
  const list=selectVisibleRoadAlerts([good,{...good},unapproved,expired],now);
  assert.deepEqual(list.map(x=>x.id),[good.id]);
  assert.deepEqual(selectVisibleRoadAlerts([good],Date.parse(good.expiresAt)),[]);
  assert.deepEqual(selectVisibleRoadAlerts([{...good,status:'rejected'}],now),[]);
});
test('MapLibre and Leaflet reuse unchanged alert pins and refresh selected report data',()=>{
  const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const ui=read('src/components/InteractiveMap.tsx');
  const renderer=read('src/services/mapLibreRoadAlertMarkers.ts');
  assert.match(ui,/roadAlertFallbackMarkersRef/);
  assert.match(ui,/roadAlertMarkerChange\(record\?\.alert\|\|null,alert\)/);
  assert.match(ui,/record!\.marker\.setLatLng\(\[alert\.lat,alert\.lng\]\)/);
  assert.match(ui,/openRoadAlertRef\.current\(existing\.get\(alert\.id\)\?\.alert\?\?alert\)/);
  assert.match(ui,/controller\.update\(roadAlertInputRef\.current\)/);
  assert.match(ui,/controller\.update\(roadAlerts\)/);
  assert.match(ui,/\},\[vectorRoutesReady\]\)/);
  assert.match(renderer,/record!\.marker\.setLngLat\(\[alert\.lng,alert\.lat\]\)/);
  assert.match(renderer,/onSelect\(markers\.get\(alert\.id\)\?\.alert\?\?alert\)/);
  assert.match(renderer,/if\(!wanted\.has\(id\)\)\{record\.marker\.remove\(\);markers\.delete\(id\);\}/);
  assert.doesNotMatch(renderer,/\.setHTML\(|innerHTML/);
});

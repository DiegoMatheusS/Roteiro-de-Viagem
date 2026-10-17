import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectVisibleRoadAlerts} from '../src/services/mapRoadAlerts';
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
  assert.match(ui,/L\.marker\(\[alert\.lat, alert\.lng\]/);
  assert.match(ui,/addRoleMaplibreRoadAlerts\(gl,alerts,openRoadAlert\)/);
  assert.match(ui,/roadAlertGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(ui,/setVectorAlertsReady\(false\)/);
  assert.match(ui,/setVectorAlertsReady\(true\)/);
  assert.match(ui,/setSelectedRoadAlert\(alert\)/);
  assert.match(ui,/Ainda continua lá\?/);
  assert.match(renderer,/new Marker\(\{ element:button, anchor:'center' \}\)/);
  assert.match(renderer,/setLngLat\(\[alert\.lng,alert\.lat\]\)/);
  assert.match(renderer,/button\.setAttribute\('aria-label'/);
  assert.match(renderer,/button\.addEventListener\('click'/);
  assert.match(renderer,/marker\.remove\(\)/);
  assert.doesNotMatch(icons,/alert\.note\s*\+/);
  assert.doesNotMatch(icons,/sourceUrl\s*\+/);
});

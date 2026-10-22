import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offlineChoiceFromGraph,choiceLabel,choiceToTrip,fetchOfflineRouteChoice} from '../src/services/routeChoices';
import {validateOfflineRoadGraph,type OfflineRoadGraph} from '../src/services/offlineRoadGraph';
import {GUEST_NAVIGATION_VEHICLE} from '../src/services/guestNavigationVehicle';
const a:[number,number]=[-23.5500,-46.6330];
const b:[number,number]=[-23.5500,-46.6325];
const c:[number,number]=[-23.5495,-46.6325];
const bounds={south:-23.552,west:-46.635,north:-23.548,east:-46.63};
const graph:OfflineRoadGraph=validateOfflineRoadGraph({
  format:'role-road-graph-v1',regionId:'test-licensed-roads',
  sourceId:'offline-licensed',attribution:'© Ruas importadas com licença',
  offlinePermissionConfirmed:true,
  nodes:[{id:'a',coords:a},{id:'b',coords:b},{id:'c',coords:c}],
  edges:[
    {from:'a',to:'b',path:[a,b],speedKmh:30},
    {from:'b',to:'c',path:[b,c],speedKmh:30}
  ]
},bounds);
test('planejamento local só constrói opção a partir de ruas conectadas reais',()=>{
  const choice=offlineChoiceFromGraph(graph,a,c);
  assert.equal(choice.id,'offline-test-licensed-roads');
  assert.equal(choice.source,'offline-graph');
  assert.equal(choice.kind,'fast');
  assert.deepEqual(choice.routePath,[a,b,c]);
  assert.equal(choice.routeSteps.length,2);
  assert.equal(choice.routeSteps[0].type,'depart');
  assert.equal(choice.routeSteps[1].type,'arrive');
  assert.ok(choice.distanceKm>0);
  assert.ok(choice.durationMinutes>0);
  assert.equal(choiceLabel(choice,0),'Trajeto offline · ruas locais');
  assert.equal(choice.trafficStatus,'unavailable');
  assert.equal(choice.tollStatus,'unchecked');
});
test('uma viagem offline mantém a origem correta e não declara OSRM nem pedágio confirmado',()=>{
  const choice=offlineChoiceFromGraph(graph,a,c);
  const trip=choiceToTrip(choice,GUEST_NAVIGATION_VEHICLE,a,{name:'Destino local',coords:c});
  assert.equal(trip.routingSource,'offline-graph');
  assert.equal(trip.destinationName,'Destino local');
  assert.equal(trip.distanceKm,choice.distanceKm);
  assert.equal(trip.drivingMinutes,choice.durationMinutes);
  assert.deepEqual(trip.routePath,[a,b,c]);
  assert.equal(trip.tollsStatus,'unknown');
  assert.equal(trip.estimatedFuelLiters,0);
  assert.match((trip.routeWarnings||[]).join(' '),/Sem instruções de curva/);
});
test('sem ligação rodoviária não inventa linha entre GPS e destino',()=>{
  assert.throws(()=>offlineChoiceFromGraph(graph,c,a),/percurso offline conectado/);
  assert.throws(()=>offlineChoiceFromGraph(graph,[-23.56,-46.64],c),/percurso offline conectado/);
  assert.throws(()=>offlineChoiceFromGraph(graph,a,[NaN,-46.63]),/percurso offline conectado/);
});
test('não tenta ler IndexedDB ao usar o motor offline fora do navegador',async()=>{
  if(typeof indexedDB!=='undefined')return;
  await assert.rejects(fetchOfflineRouteChoice(a,c),/Armazenamento de ruas offline indisponível/);
});
test('fluxo distingue fonte local e não anuncia manobras de voz não verificadas',()=>{
  const src=readFileSync(new URL('../src/services/routeChoices.ts',import.meta.url),'utf8');
  assert.match(src,/source:'offline-graph'/);
  assert.match(src,/navigator\.onLine===false/);
  assert.match(src,/fetchOfflineRouteChoice\(originCoords,destinationCoords,signal\)/);
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/trip.routingSource !== 'offline-graph'/);
  const modal=readFileSync(new URL('../src/components/ActiveTripModal.tsx',import.meta.url),'utf8');
  assert.match(modal,/usingLocalRoadGraph\)\?null/);
  assert.match(modal,/Trajeto offline sem orientações de conversão/);
  const explorer=readFileSync(new URL('../src/components/DestinationExplorer.tsx',import.meta.url),'utf8');
  assert.match(explorer,/choice.source==='offline-graph'/);
  assert.match(explorer,/Rota local calculada sem internet/);
});

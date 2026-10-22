import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateOfflineRoadRoute,roadDistanceMeters,validateOfflineRoadGraph,
  type OfflineRoadGraph} from '../src/services/offlineRoadGraph';
const a:[number,number]=[-23.5500,-46.6330];
const b:[number,number]=[-23.5500,-46.6325];
const c:[number,number]=[-23.5495,-46.6325];
const d:[number,number]=[-23.5495,-46.6330];
const bounds={south:-23.552,west:-46.635,north:-23.547,east:-46.63};
const base:OfflineRoadGraph={
 format:'role-road-graph-v1',regionId:'centro-legal',
 attribution:'© Rede viária com permissão de armazenamento',
 sourceId:'rede-autorizada',offlinePermissionConfirmed:true,
 nodes:[{id:'a',coords:a},{id:'b',coords:b},{id:'c',coords:c},{id:'d',coords:d}],
 edges:[
  {from:'a',to:'b',path:[a,b],speedKmh:30,name:'Rua A'},
  {from:'b',to:'c',path:[b,c],speedKmh:30,name:'Rua B'},
  {from:'a',to:'d',path:[a,d],speedKmh:25,name:'Rua C'},
  {from:'d',to:'c',path:[d,c],speedKmh:25,name:'Rua D'},
  // This graph has *no* c->b edge: that road is one-way.
  {from:'c',to:'d',path:[c,d],speedKmh:25,name:'Rua D'}
 ]
};
test('rede viária direcionada respeita a malha real e atribuição',()=>{
 const graph=validateOfflineRoadGraph(base,bounds);
 const route=calculateOfflineRoadRoute(graph,a,c);
 assert.ok(route);
 assert.deepEqual(route.routePath,[a,b,c]);
 assert.equal(route.edgeCount,2);
 assert.ok(route.distanceKm>.08&&route.distanceKm<.2);
 assert.ok(route.drivingMinutes>0);
 assert.equal(route.snappedOriginMeters,0);
 assert.equal(roadDistanceMeters(a,a),0);
 assert.ok(roadDistanceMeters(a,b)>30);
});
test('não atravessa rua sem conexão nem ignora contramão',()=>{
 const oneWay={...base,edges:base.edges.slice(0,2)};
 const graph=validateOfflineRoadGraph(oneWay,bounds);
 assert.equal(calculateOfflineRoadRoute(graph,c,a),null);
 assert.deepEqual(calculateOfflineRoadRoute(graph,a,c)?.routePath,[a,b,c]);
 // One-way restriction cannot be defeated by straight GPS-to-destination link.
 assert.equal(calculateOfflineRoadRoute(graph,a,d),null);
});
test('escolhe caminho pelo tempo das arestas, não por linhas retas entre pontos',()=>{
 const fast={...base,edges:base.edges.map(edge=>edge.from==='a'&&edge.to==='d'||
 edge.from==='d'&&edge.to==='c'?{...edge,speedKmh:90}:{...edge,speedKmh:10})};
 const route=calculateOfflineRoadRoute(validateOfflineRoadGraph(fast,bounds),a,c);
 assert.deepEqual(route?.routePath,[a,d,c]);
});
test('recusa GPS fora da rede e direção ou destino sem cobertura',()=>{
 const graph=validateOfflineRoadGraph(base,bounds);
 assert.equal(calculateOfflineRoadRoute(graph,[-23.56,-46.64],c),null);
 assert.equal(calculateOfflineRoadRoute(graph,a,[-23.56,-46.64]),null);
 assert.equal(calculateOfflineRoadRoute(graph,a,a),null);
 assert.equal(calculateOfflineRoadRoute(graph,[NaN,0],c),null);
});
test('não aceita conexão fictícia, geometrias quebradas, pontos fora da área ou licença falsa',()=>{
 const invalid=[
  {...base,offlinePermissionConfirmed:false},
  {...base,nodes:[...base.nodes,base.nodes[0]]},
  {...base,nodes:[...base.nodes.slice(0,2),{id:'c',coords:[-23.6,-46.6]},base.nodes[3]]},
  {...base,edges:[{from:'a',to:'c',path:[a,[-23.58,-46.60],c],speedKmh:50}]},
  {...base,edges:[{from:'a',to:'b',path:[c,b],speedKmh:50}]},
  {...base,edges:[{from:'a',to:'b',path:[a,b],speedKmh:0}]},
  {...base,edges:[{from:'a',to:'b',path:[a,b],speedKmh:200}]},
  {...base,edges:[]}
 ];
 for(const bad of invalid)assert.throws(()=>validateOfflineRoadGraph(bad,bounds));
});
test('roteamento offline jamais chama API externa e preserva paradas obrigatórias',()=>{
 const offline=readFileSync(new URL('../src/services/offlineRoadReroute.ts',import.meta.url),'utf8');
 assert.doesNotMatch(offline,/fuelApi\(|fetch\(|XMLHttpRequest|https?:\/\//);
 assert.match(offline,/findOfflineRoadGraph\(points\)/);
 assert.match(offline,/for\(let i=1;i<points.length;i\+\+\)/);
 assert.match(offline,/remainingStopIds/);
 assert.match(offline,/source:'offline-graph'/);
 assert.match(offline,/sem instruções de conversão/);
 const auto=readFileSync(new URL('../src/services/autoReroute.ts',import.meta.url),'utf8');
 assert.match(auto,/import\('\.\/offlineRoadReroute'\)/);
 assert.match(auto,/navigator\.onLine===false/);
 assert.match(auto,/if\(signal\?\.aborted\)throw error/);
 const settings=readFileSync(new URL('../src/components/OfflineRegionsPanel.tsx',import.meta.url),'utf8');
 assert.match(settings,/importOfflineRoadGraph\(file\)/);
 assert.match(settings,/Importar rede de ruas licenciada/i);
});

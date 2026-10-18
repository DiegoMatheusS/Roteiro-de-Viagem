import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNavigationGuidance } from '../src/services/navigationGuidance';
import type { NavigationManeuver } from '../src/types';

const path: [number,number][] = [[-23,-46],[-23,-45.99],[-23,-45.98]];
const steps: NavigationManeuver[] = [
  { coords:path[0],distanceFromStartKm:0,type:'depart',name:'Rua A' },
  { coords:path[1],distanceFromStartKm:1.024,type:'turn',modifier:'right',name:'Rua B' },
  { coords:path[2],distanceFromStartKm:2.048,type:'arrive',name:'' }
];
test('apresenta a próxima conversão real com distância progressiva',()=>{
  const result=nextNavigationGuidance(path,steps,[-23,-45.995]);
  assert.equal(result?.direction,'right');
  assert.equal(result?.text,'Vire à direita');
  assert.equal(result?.road,'Rua B');
  assert.ok((result?.meters ?? 0)>400 && (result?.meters ?? 0)<650);
});
test('não inventa orientações fora da rota ou sem passos verificados',()=>{
  assert.equal(nextNavigationGuidance(path,steps,[-24,-46]),null);
  assert.equal(nextNavigationGuidance(path,[],[-23,-45.995]),null);
});
test('não anuncia chegada quando há apenas uma parada intermediária',()=>{
  const withStop:NavigationManeuver[]=[
    steps[0],{coords:path[1],distanceFromStartKm:1.024,type:'arrive',name:'Parada'},
    {coords:path[1],distanceFromStartKm:1.024,type:'depart',name:'Parada'},
    {coords:path[2],distanceFromStartKm:2.048,type:'arrive',name:''}
  ];
  const result=nextNavigationGuidance(path,withStop,[-23,-45.995]);
  assert.equal(result?.direction,'arrive');
  assert.ok((result?.meters ?? 0)>1000);
});

const circuit:[number,number][]=[[0,0],[0,.01],[.01,.01],[.01,0],[0,0]];
const circuitSteps:NavigationManeuver[]=[
  {coords:circuit[0],distanceFromStartKm:0,type:'depart',name:'Início'},
  {coords:circuit[1],distanceFromStartKm:1,type:'turn',modifier:'right',name:'Primeira curva'},
  {coords:circuit[2],distanceFromStartKm:2,type:'turn',modifier:'right',name:'Segunda curva'},
  {coords:circuit[3],distanceFromStartKm:3,type:'turn',modifier:'right',name:'Retorno'},
  {coords:circuit[4],distanceFromStartKm:4,type:'arrive',name:'Destino'}
];
test('circuito diferencia a saída da chegada na mesma coordenada',()=>{
  assert.equal(nextNavigationGuidance(circuit,circuitSteps,[0,0],0,4)?.road,'Primeira curva');
  const arrival=nextNavigationGuidance(circuit,circuitSteps,[0,0],3.98,4);
  assert.equal(arrival?.direction,'arrive');
  assert.equal(arrival?.meters,0);
  assert.equal(nextNavigationGuidance(circuit,circuitSteps,[-.00001,.00001],3.98,4)?.direction,'arrive');
});
test('cruzamento repetido usa o avanço para anunciar a manobra do trecho de volta',()=>{
  const crossing:[number,number][]=[[0,-.01],[0,0],[0,.01],[.01,.01],[.01,0],[0,0],[-.01,0]];
  const maneuvers:NavigationManeuver[]=[
    {coords:crossing[0],distanceFromStartKm:0,type:'depart',name:'Saída'},
    {coords:crossing[1],distanceFromStartKm:1,type:'turn',modifier:'right',name:'Trecho de ida'},
    {coords:crossing[5],distanceFromStartKm:5,type:'turn',modifier:'left',name:'Trecho de volta'},
    {coords:crossing[6],distanceFromStartKm:6,type:'arrive',name:'Destino'}
  ];
  assert.equal(nextNavigationGuidance(crossing,maneuvers,[0,0],1,6)?.road,'Trecho de ida');
  assert.equal(nextNavigationGuidance(crossing,maneuvers,[0,0],5,6)?.road,'Trecho de volta');
});
test('avanço não força outra via distante nem cria instruções fora da rota',()=>{
  const unique=nextNavigationGuidance(circuit,circuitSteps,[0,.005],3.9,4);
  assert.equal(unique?.road,'Primeira curva');
  assert.equal(unique?.meters,500);
  assert.equal(nextNavigationGuidance(circuit,circuitSteps,[.1,.1],3.9,4),null);
  for(const progress of [NaN,Infinity,-1])
    assert.equal(nextNavigationGuidance(circuit,circuitSteps,[0,0],progress,4)?.road,'Primeira curva');
  for(const total of [0,-1,NaN,Infinity])
    assert.equal(nextNavigationGuidance(circuit,circuitSteps,[0,0],3.9,total)?.road,'Primeira curva');
});

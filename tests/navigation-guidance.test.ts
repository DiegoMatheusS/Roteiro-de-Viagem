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

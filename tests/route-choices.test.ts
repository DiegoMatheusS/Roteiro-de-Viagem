import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceLabel, prioritizeRoleRoutes, type VerifiedRouteChoice } from '../src/services/routeChoices';

const make=(kind:VerifiedRouteChoice['kind'],id:string,durationMinutes:number):VerifiedRouteChoice=>({
  id,kind,durationMinutes,distanceKm:10,routePath:[[-23,-46],[-23,-45.9]],
  routeSteps:[],trafficStatus:'unavailable',tollStatus:'unchecked'
});
test('Rolê prioriza passeio verificado sobre rota mais rápida',()=>{
  const result=prioritizeRoleRoutes([make('fast','fast',10),make('alternative','other',15),
    make('tourist','historic',25),make('stroll','park',30),make('panoramic','view',35)]);
  assert.deepEqual(result.map(x=>x.id),['view','historic','park','other','fast']);
});
test('sem atrações, mantém opções reais sem chamar a rota de turística',()=>{
  const result=prioritizeRoleRoutes([make('fast','fast',10),make('alternative','other',15)]);
  assert.deepEqual(result.map(x=>choiceLabel(x,0)),['Rota alternativa','Rota mais rápida']);
});

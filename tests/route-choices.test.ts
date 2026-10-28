import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceLabel, prioritizeRoleRoutes, fetchRouteChoices, type VerifiedRouteChoice } from '../src/services/routeChoices';

const make=(kind:VerifiedRouteChoice['kind'],id:string,durationMinutes:number):VerifiedRouteChoice=>({
  id,kind,durationMinutes,distanceKm:10,routePath:[[-23,-46],[-23,-45.9]],
  routeSteps:[],trafficStatus:'unavailable',tollStatus:'unchecked'
});
test('Rolê prioriza passeio verificado sobre rota mais rápida',()=>{
  const result=prioritizeRoleRoutes([make('fast','fast',10),make('alternative','other',15),
    make('tourist','historic',25),make('stroll','park',30),make('panoramic','view',35)]);
  assert.deepEqual(result.map(x=>x.id),['view','historic','park','fast','other']);
});
test('sem atrações, mantém opções reais sem chamar a rota de turística',()=>{
  const result=prioritizeRoleRoutes([make('fast','fast',10),make('alternative','other',15)]);
  assert.deepEqual(result.map(x=>choiceLabel(x,0)),['Rota mais rápida','Rota alternativa']);
});
test('busca de endereço seleciona o menor tempo estimado e conserva os passeios como alternativas',()=>{
  const input=[make('tourist','historic',25),make('panoramic','view',35),
    make('alternative','other',15),make('fast','fast',10)];
  assert.deepEqual(prioritizeRoleRoutes(input,'fast').map(x=>x.id),['fast','other','historic','view']);
  assert.deepEqual(input.map(x=>x.id),['historic','view','other','fast'],'a preferência não pode mutar as opções recebidas');
});
test('sem rótulo fast, escolhe a alternativa realmente mais curta em tempo',()=>{
  assert.equal(prioritizeRoleRoutes([make('alternative','long',30),make('alternative','short',12)],'fast')[0].id,'short');
});
test('preferência turística mantém a atração verificada; sem ela usa a rota mais rápida disponível',()=>{
  assert.equal(prioritizeRoleRoutes([make('fast','fast',10),make('tourist','museum',22)],'tourist')[0].id,'museum');
  assert.equal(prioritizeRoleRoutes([make('alternative','long',30),make('fast','fast',10)],'tourist')[0].id,'fast');
});
test('empate no tempo mantém a rota rápida verificada em primeiro lugar',()=>{
  const a=make('alternative','other',10),b=make('fast','fast',10);
  assert.equal(prioritizeRoleRoutes([a,b],'fast')[0].id,'fast');
});
test('consulta aplica a preferência escolhida e ignora alternativas sem duração válida',async t=>{
  const input=[make('tourist','museum',25),make('fast','fast',10),make('fast','invalid',0)];
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({options:input,trafficDataAvailable:false})));
  const quick=await fetchRouteChoices([-23,-46],[-23,-45.9],undefined,'fast');
  const planning=await fetchRouteChoices([-23,-46],[-23,-45.9],undefined,'tourist');
  assert.deepEqual(quick.map(x=>x.id),['fast','museum']);
  assert.deepEqual(planning.map(x=>x.id),['museum','fast']);
  assert.ok(quick.every(x=>x.source==='OSRM'));
});

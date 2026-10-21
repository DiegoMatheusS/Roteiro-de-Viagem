import test from 'node:test';
import assert from 'node:assert/strict';
import type { Map as GlMap } from 'maplibre-gl';
import { applyRoleVectorPalette, roleVectorPaintForLayer } from '../src/services/mapVectorStyle';

test('paleta clara mantém prédios brancos, ruas cinzas e água/vegetação coloridas', () => {
  assert.deepEqual(roleVectorPaintForLayer({ id:'background',type:'background' }),
    { 'background-color':'#f5f7f8' });
  assert.deepEqual(roleVectorPaintForLayer({ id:'building',type:'fill' }),
    { 'fill-color':'#ffffff','fill-outline-color':'#dbe3e9' });
  assert.equal(roleVectorPaintForLayer({ id:'water',type:'fill' })['fill-color'],'#b7def5');
  assert.equal(roleVectorPaintForLayer({ id:'park',type:'fill' })['fill-color'],'#d7ecd9');
  assert.equal(roleVectorPaintForLayer({ id:'landcover_wood',type:'fill' })['fill-color'],'#c9e5cf');
  assert.equal(roleVectorPaintForLayer({ id:'highway_minor',type:'line' })['line-color'],'#d5dee6');
  assert.equal(roleVectorPaintForLayer({ id:'highway_major_inner',type:'line' })['line-color'],'#f2f5f7');
  assert.equal(roleVectorPaintForLayer({ id:'highway_motorway_bridge_casing',type:'line' })['line-color'],'#aebfcb');
  assert.equal(roleVectorPaintForLayer({ id:'waterway',type:'line' })['line-color'],'#91c5e7');
  assert.equal(roleVectorPaintForLayer({ id:'label_city',type:'symbol' })['text-color'],'#2c4052');
  assert.equal(roleVectorPaintForLayer({ id:'highway-name-minor',type:'symbol' })['text-halo-color'],'#f8fafc');
});

test('somente base OpenFreeMap muda: rotas e símbolos próprios são preservados', () => {
  assert.deepEqual(roleVectorPaintForLayer({ id:'role-remaining-line',type:'line' }),{});
  assert.deepEqual(roleVectorPaintForLayer({ id:'role-travelled-line',type:'line' }),{});
  assert.deepEqual(roleVectorPaintForLayer({ id:'role-alternative-outline',type:'line' }),{});
  assert.deepEqual(roleVectorPaintForLayer({ id:'road_shield_us',type:'symbol' }),{});
  assert.deepEqual(roleVectorPaintForLayer({ id:'airport',type:'symbol' }),{});
  assert.deepEqual(roleVectorPaintForLayer({ id:'aeroway-area',type:'fill' }),{});
});

test('aplica só propriedades de tinta e tolera uma camada ausente', () => {
  const changes: string[] = [];
  const map = {
    getStyle: () => ({ layers: [
      { id:'water',type:'fill' },
      { id:'building',type:'fill' },
      { id:'role-remaining-line',type:'line' },
      { id:'highway_major_casing',type:'line' },
    ] }),
    setPaintProperty(id:string,property:string,color:string) {
      changes.push(`${id}:${property}=${color}`);
      if(id==='water') throw Error('estilo foi trocado');
    },
  } as unknown as GlMap;
  assert.doesNotThrow(()=>applyRoleVectorPalette(map));
  assert.deepEqual(changes,[
    'water:fill-color=#b7def5',
    'building:fill-color=#ffffff',
    'building:fill-outline-color=#dbe3e9',
    'highway_major_casing:line-color=#b8c7d1',
  ]);
});

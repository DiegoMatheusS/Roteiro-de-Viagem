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
  assert.equal(roleVectorPaintForLayer({ id:'highway_minor',type:'line' })['line-color'],'#bfc6ce');
  assert.equal(roleVectorPaintForLayer({ id:'highway_major_inner',type:'line' })['line-color'],'#bfc6ce');
  assert.equal(roleVectorPaintForLayer({ id:'highway_motorway_bridge_casing',type:'line' })['line-color'],'#bfc6ce');
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
    'highway_major_casing:line-color=#bfc6ce',
  ]);
});

test('night uses navy land and filled light-grey roads, including inner strokes, bridges and tunnels',()=>{
  const color=(id:string,type:string,paint:string)=>roleVectorPaintForLayer({id,type},'dark')[paint];
  assert.equal(color('background','background','background-color'),'#1b2d47');
  for(const id of ['highway_minor','highway_major_casing','highway_major_inner',
    'highway_major_subtle','highway_motorway_bridge_inner','tunnel_motorway_inner'])
    assert.equal(color(id,'line','line-color'),'#aebaca',id);
  for(const id of ['landuse_residential','building','aeroway-area','landcover_glacier'])
    assert.match(String(color(id,'fill','fill-color')),/^#[123]/,id+' must not keep the white day fill');
  assert.equal(color('highway-name-minor','symbol','text-opacity'),1);
  assert.equal(color('highway-name-minor','symbol','text-halo-color'),'#1b2d47');
  assert.deepEqual(roleVectorPaintForLayer({id:'role-remaining-line',type:'line'},'dark'),{});
});

test('street names retain local names and become readable at city zoom without overlapping',()=>{
  for(const theme of ['light','dark'] as const){
    const layouts=new Map<string,unknown>();
    const zooms:unknown[][]=[];
    const map={
      getStyle:()=>({layers:[{id:'highway-name-minor',type:'symbol',minzoom:15,maxzoom:24}]}),
      setPaintProperty:()=>{},
      setLayerZoomRange:(...args:unknown[])=>zooms.push(args),
      setLayoutProperty:(_id:string,key:string,value:unknown)=>layouts.set(key,value)
    } as unknown as GlMap;
    applyRoleVectorPalette(map,theme);
    assert.deepEqual(zooms,[['highway-name-minor',14,24]]);
    assert.equal(layouts.get('visibility'),'visible');
    assert.deepEqual(layouts.get('text-field'),['coalesce',['get','name'],['get','name:latin'],['get','name_en']]);
    assert.equal(layouts.get('text-pitch-alignment'),'viewport');
    assert.equal(layouts.get('text-allow-overlap'),false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Map as GlMap } from 'maplibre-gl';
import { applyRoleVectorPalette, roleVectorPaintForLayer,roleNavigationPaintForLayer,roleNavigationRoadWidth } from '../src/services/mapVectorStyle';

test('mapa claro mantém vias neutras sem sugerir congestionamento', () => {
  assert.deepEqual(roleVectorPaintForLayer({ id:'background',type:'background' }),
    { 'background-color':'#edf0f2' });
  assert.deepEqual(roleVectorPaintForLayer({ id:'building',type:'fill' }),
    { 'fill-color':'#e0e4e9','fill-outline-color':'#c5cfd7' });
  assert.equal(roleVectorPaintForLayer({ id:'water',type:'fill' })['fill-color'],'#b8e2f4');
  assert.equal(roleVectorPaintForLayer({ id:'park',type:'fill' })['fill-color'],'#c2e9bd');
  assert.equal(roleVectorPaintForLayer({ id:'landcover_wood',type:'fill' })['fill-color'],'#c2e9bd');
  assert.equal(roleVectorPaintForLayer({ id:'highway_minor',type:'line' })['line-color'],'#ffffff');
  assert.equal(roleVectorPaintForLayer({ id:'highway_major_inner',type:'line' })['line-color'],'#ffffff');
  assert.equal(roleVectorPaintForLayer({ id:'highway_motorway_bridge_casing',type:'line' })['line-color'],'#b8c4cf');
  assert.equal(roleVectorPaintForLayer({ id:'waterway',type:'line' })['line-color'],'#83c5e7');
  assert.equal(roleVectorPaintForLayer({ id:'label_city',type:'symbol' })['text-color'],'#304459');
  assert.equal(roleVectorPaintForLayer({ id:'highway-name-minor',type:'symbol' })['text-halo-color'],'#f8fafb');
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
    'water:fill-color=#b8e2f4',
    'building:fill-color=#e0e4e9',
    'building:fill-outline-color=#c5cfd7',
    'highway_major_casing:line-color=#b8c4cf',
  ]);
});

test('noite mantém ruas e avenidas em cinza-azulado',()=>{
  const color=(id:string,type:string,paint:string)=>roleVectorPaintForLayer({id,type},'dark')[paint];
  assert.equal(color('background','background','background-color'),'#1b2d47');
  assert.equal(color('highway_minor','line','line-color'),'#8795a9');
  assert.equal(color('highway_major_casing','line','line-color'),'#40536b');
  assert.equal(color('highway_major_inner','line','line-color'),'#9aaabd');
  assert.equal(color('highway_motorway_bridge_casing','line','line-color'),'#40536b');
  assert.equal(color('highway_motorway_bridge_inner','line','line-color'),'#a9b9cd');
  assert.equal(color('tunnel_motorway_inner','line','line-color'),'#a9b9cd');
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


test('navegação clareia menos o mapa e amplia vias sem alterar camadas próprias',()=>{
  assert.deepEqual(roleNavigationPaintForLayer({id:'background',type:'background'},'light'),{'background-color':'#e9edf0'});
  assert.deepEqual(roleNavigationPaintForLayer({id:'role-remaining-line',type:'line'},'light'),{});
  assert.equal(roleNavigationRoadWidth({id:'role-remaining-line',type:'line'}),null);
  const main=roleNavigationRoadWidth({id:'highway_primary_inner',type:'line'});
  assert.deepEqual(main,['interpolate',['linear'],['zoom'],11,3,14,9,16,16,19,26]);
  const local=roleNavigationRoadWidth({id:'highway_minor',type:'line'});
  assert.deepEqual(local,['interpolate',['linear'],['zoom'],11,2,14,6,16,11,19,20]);
  const casing=roleNavigationRoadWidth({id:'highway_major_casing',type:'line'});
  assert.deepEqual(casing,['interpolate',['linear'],['zoom'],11,6,14,12,16,19,19,29]);
  const motorway=roleNavigationRoadWidth({id:'highway_motorway_inner',type:'line'});
  assert.deepEqual(motorway,['interpolate',['linear'],['zoom'],11,4,14,11,16,19,19,30]);
  assert.equal(roleNavigationRoadWidth({id:'highway-name-minor',type:'symbol'}),null);
  assert.equal(roleNavigationRoadWidth({id:'highway_path',type:'line'}),null);
  assert.deepEqual(roleNavigationPaintForLayer({id:'highway_motorway_inner',type:'line'},'light'),{'line-color':'#f7fafc'});
  assert.deepEqual(roleNavigationPaintForLayer({id:'park',type:'fill'},'light'),{'fill-color':'#bce5b7'});
  assert.deepEqual(roleNavigationPaintForLayer({id:'water',type:'fill'},'light'),{'fill-color':'#b8e2f4'});
});

test('modo navegação reduz rótulos de POI da base sem ocultar nomes de ruas nem pinos do Rolê',()=>{
  const layouts:string[]=[];
  const widths:string[]=[];
  const map={
    getStyle:()=>({layers:[
      {id:'poi_z16',type:'symbol'},
      {id:'label_other',type:'symbol'},
      {id:'highway-name-minor',type:'symbol',minzoom:15,maxzoom:24},
      {id:'highway_motorway_casing',type:'line'},
      {id:'role-remaining-line',type:'line'},
    ]}),
    setPaintProperty:(id:string,prop:string,value:unknown)=>{if(prop==='line-width')widths.push(id+':'+JSON.stringify(value));},
    setLayerZoomRange:()=>{},
    setLayoutProperty:(id:string,key:string,value:unknown)=>layouts.push(id+':'+key+'='+JSON.stringify(value)),
  } as unknown as GlMap;
  applyRoleVectorPalette(map,'light',true);
  assert.ok(layouts.includes('poi_z16:visibility="none"'));
  assert.ok(layouts.includes('label_other:visibility="none"'));
  assert.ok(layouts.includes('highway-name-minor:visibility="visible"'));
  assert.ok(widths.some(s=>s.startsWith('highway_motorway_casing:')));
  assert.ok(!widths.some(s=>s.startsWith('role-remaining-line:')));
});

test('nenhuma categoria de via sugere trânsito antes de carregar dados reais',()=>{
  for(const theme of ['light','dark'] as const)
    for(const id of ['highway_minor','highway_major_inner','highway_primary_casing','highway_motorway_inner','tunnel_motorway_inner']){
      const color=roleNavigationPaintForLayer({id,type:'line'},theme)['line-color']
        ??roleVectorPaintForLayer({id,type:'line'},theme)['line-color'];
      assert.doesNotMatch(String(color),/^#(?:ff(?:d|e)|d8a|c8b|765)/i,id);
    }
});

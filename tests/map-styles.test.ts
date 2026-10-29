import test from 'node:test';
import assert from 'node:assert/strict';
import {standaloneBaseStyle,TILE_PROVIDERS} from '../src/services/mapStyles';
import {ROLE_VECTOR_STYLE} from '../src/services/mapVectorStyle';

test('light preserves the vector base and satellite preserves the existing raster provider',()=>{
  assert.equal(standaloneBaseStyle('light'),ROLE_VECTOR_STYLE);
  assert.equal(standaloneBaseStyle('light','dark'),ROLE_VECTOR_STYLE,
    'day and night must keep the same filled roads and street-name source');
  const satellite=standaloneBaseStyle('satellite');
  assert.equal(typeof satellite,'object');
  if(typeof satellite==='string')throw Error('raster style expected');
  const source=satellite.sources['role-raster-base'];
  assert.equal(source.type,'raster');
  if(source.type!=='raster')throw Error('raster source expected');
  assert.deepEqual(source.tiles,[TILE_PROVIDERS.satellite.url]);
  assert.equal(source.tileSize,256);
  assert.equal(source.maxzoom,18);
  assert.equal(source.attribution,TILE_PROVIDERS.satellite.attribution);
  assert.deepEqual(satellite.layers,[{id:'role-raster-base',type:'raster',source:'role-raster-base'}]);
  assert.equal(satellite.center,undefined);
  assert.equal(satellite.zoom,undefined);
  assert.equal(satellite.bearing,undefined);
});
test('topographic style expands subdomains without changing the map camera',()=>{
  const style=standaloneBaseStyle('topo');
  if(typeof style==='string')throw Error('raster style expected');
  const source=style.sources['role-raster-base'];
  if(source.type!=='raster')throw Error('raster source expected');
  assert.deepEqual(source.tiles,['a','b','c'].map(host=>`https://${host}.tile.opentopomap.org/{z}/{x}/{y}.png`));
  assert.equal(source.maxzoom,17);
  assert.equal(style.center,undefined);
  assert.equal(style.zoom,undefined);
});

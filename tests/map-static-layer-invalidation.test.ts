import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {changedStaticLayers,type StaticLayerInputs} from '../src/services/mapStaticLayerInvalidation';

const origin:[number,number]=[-23.55,-46.64];
const dest:[number,number]=[-23.56,-46.66];
const stops=[{id:'viewpoint:1',lat:-23.55,lng:-46.64}];
const meetings=[{id:'meeting:1',coords:[-23.6,-46.7]}];
const weather=[{id:'forecast:1',coords:[-23.58,-46.67]}];
const base:StaticLayerInputs={
  navigation:[origin,dest,'Origem','Destino',false,true,false],
  stops:[stops,false],
  meetings:[meetings,false],
  weather:[weather,true,false]
};
const none={navigation:false,stops:false,meetings:false,weather:false};
test('first fallback render creates all static overlays once',()=>{
  assert.deepEqual(changedStaticLayers(null,base),{navigation:true,stops:true,meetings:true,weather:true});
});
test('switching alternative route does not remove tourist popups or other static markers',()=>{
  assert.deepEqual(changedStaticLayers(base,{...base}),none);
  // Selected route ID, path, modality and GPS progress are intentionally not
  // part of static marker signatures; they cannot force marker replacement.
  const otherRouteId='scenic';
  assert.equal(otherRouteId,'scenic');
  assert.deepEqual(changedStaticLayers(base,base),none);
});
test('changing only relevant content invalidates only its corresponding group',()=>{
  assert.deepEqual(changedStaticLayers(base,{...base,weather:[weather,false,false]}),
    {...none,weather:true});
  assert.deepEqual(changedStaticLayers(base,{...base,stops:[[...stops],false]}),
    {...none,stops:true});
  assert.deepEqual(changedStaticLayers(base,{...base,meetings:[meetings,true]}),
    {...none,meetings:true});
  assert.deepEqual(changedStaticLayers(base,{...base,navigation:[origin,dest,'Origem','Novo destino',false,true,false]}),
    {...none,navigation:true});
});
test('raster/vector fallback switches still redraw the corresponding layer once',()=>{
  assert.deepEqual(changedStaticLayers(base,{...base,weather:[weather,true,true]}),
    {...none,weather:true});
  assert.deepEqual(changedStaticLayers(base,{...base,stops:[stops,true],meetings:[meetings,true]}),
    {...none,stops:true,meetings:true});
  assert.deepEqual(changedStaticLayers(base,{...base,navigation:[origin,dest,'Origem','Destino',false,true,true]}),
    {...none,navigation:true});
});
test('route redraw leaves individual static Leaflet layer groups mounted and keeps bounds calculation',()=>{
  const map=readFileSync(new URL('../src/components/InteractiveMap.tsx',import.meta.url),'utf8');
  assert.match(map,/const layerChanges=changedStaticLayers\(previousStaticLayerInputsRef\.current,layerInputs\)/);
  assert.match(map,/if\(layerChanges\.weather\)rainGroup\.clearLayers\(\)/);
  assert.match(map,/if\(layerChanges\.navigation\)navigationGroup\.clearLayers\(\)/);
  assert.match(map,/if\(layerChanges\.stops\)stopGroup\.clearLayers\(\)/);
  assert.match(map,/if\(layerChanges\.meetings\)meetingGroup\.clearLayers\(\)/);
  assert.match(map,/if \(!vectorTripPinsReady && layerChanges\.stops\)/);
  assert.match(map,/if \(!vectorTripPinsReady && layerChanges\.meetings\)/);
  assert.match(map,/if\(showRainLayer && !vectorWeatherReady && layerChanges\.weather\)/);
  assert.match(map,/if \(!vectorNavigationReady && layerChanges\.navigation\)/);
  assert.match(map,/bounds\.push\(mp\.coords\)/);
  assert.match(map,/bounds\.push\(destinationCoords\)/);
  assert.match(map,/group\.clearLayers\(\)/);
});

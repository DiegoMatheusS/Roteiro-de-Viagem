import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validWeatherPoint,visibleWeatherSamples,visibleRainSamples,weatherDisplayTime,weatherDisplayLines,weatherPointKey} from '../src/services/vectorWeatherData';
import {isRainForecast,rainDropsSvgMarkup,rainDropCoversArrow} from '../src/services/rainDropMarkers';
import type {WeatherPoint} from '../src/types';

const forecast:WeatherPoint={
  locationName:'Ponto de previsão verificado',
  coords:[-23.55,-46.63],passTime:'10:30',tempC:24,
  condition:'Chuva Fraca',rainProb:68,windKmH:12,windDirectionDegrees:180,
  warning:'Risco de chuva na região'
};

test('rain markers keep a clear screen-space area around the GPS arrow',()=>{
  assert.equal(rainDropCoversArrow({x:150,y:250},{x:150,y:250}),true);
  assert.equal(rainDropCoversArrow({x:193,y:290},{x:150,y:250}),true);
  assert.equal(rainDropCoversArrow({x:200,y:250},{x:150,y:250}),false);
  assert.equal(rainDropCoversArrow({x:150,y:300},{x:150,y:250}),false);
  assert.equal(rainDropCoversArrow({x:150,y:250}),false);
});

test('only provider samples with usable positions and finite weather values appear',()=>{
  assert.equal(validWeatherPoint(forecast),true);
  assert.equal(validWeatherPoint({...forecast,coords:undefined}),false);
  assert.equal(validWeatherPoint({...forecast,coords:[-98,-46]}),false);
  assert.equal(validWeatherPoint({...forecast,coords:[-23,Infinity]}),false);
  assert.equal(validWeatherPoint({...forecast,rainProb:101}),false);
  assert.equal(validWeatherPoint({...forecast,rainProb:-1}),false);
  assert.equal(validWeatherPoint({...forecast,windKmH:-4}),false);
  assert.equal(validWeatherPoint({...forecast,tempC:NaN}),false);
  assert.equal(validWeatherPoint({...forecast,locationName:'   '}),false);
});

test('dedupe by location/time without inventing new forecast areas or dates',()=>{
  const next={...forecast,passTime:'11:30'};
  const others=visibleWeatherSamples([
    forecast,{...forecast},next,{...forecast,locationName:'Outro local',coords:[-23.53,-46.64]},
    {...forecast,coords:[92,-46.6]}
  ]);
  assert.equal(others.length,3);
  assert.equal(weatherPointKey(forecast),weatherPointKey({...forecast}));
  assert.equal(weatherDisplayTime(forecast),'10:30');
  assert.equal(weatherDisplayTime({...forecast,passTime:'invalid'}),'Horário não informado');
  assert.match(weatherDisplayTime({...forecast,forecastAt:'2026-10-17T13:30:00Z'}),/17\/10/);
});

test('forecast details contain real wind, rain, warning and explicit non-live attribution',()=>{
  const lines=weatherDisplayLines(forecast);
  assert.equal(lines[0],forecast.locationName);
  assert.match(lines.join(' '),/Chuva: 68%/);
  assert.match(lines.join(' '),/Vento: 12 km\/h · direção 180°/);
  assert.ok(lines.includes('Risco de chuva na região'));
  assert.match(lines.join(' '),/Fonte: Open-Meteo \(não é radar ao vivo\)/);
  assert.doesNotMatch(weatherDisplayLines({...forecast,windDirectionDegrees:Infinity}).join(' '),/direção/);
});

test('only verified rainy samples are rendered as grouped small map droplets',()=>{
  const dry:WeatherPoint={...forecast,condition:'Ensolarado',rainProb:5};
  assert.equal(isRainForecast(forecast),true);
  assert.equal(isRainForecast(dry),false);
  assert.equal(isRainForecast({...dry,condition:'Pancadas de chuva'}),true);
  assert.deepEqual(visibleRainSamples([dry,forecast,{...forecast,coords:[180,0]}]),[forecast]);
  assert.equal((rainDropsSvgMarkup.match(/<path /g)||[]).length,5);
});

test('native MapLibre pins replace Leaflet only after markers are installed',()=>{
  const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const map=read('src/components/InteractiveMap.tsx');
  const native=read('src/services/mapLibreWeatherPins.ts');
  assert.match(map,/import\('\.\.\/services\/mapLibreWeatherPins'\)/);
  assert.match(map,/rainLayerGroupRef\.current\?\.clearLayers\(\)/);
  assert.match(map,/setVectorWeatherReady\(true\)/);
  assert.match(map,/setVectorWeatherReady\(false\)/);
  assert.match(map,/showRainLayer && !vectorWeatherReady/);
  assert.match(map,/L\.marker\(point\.coords!/);
  assert.match(map,/rainDropsSvgMarkup/);
  assert.match(map,/weatherDisplayTime\(point\)/);
  assert.match(native,/setDOMContent\(popupContent\(point\)\)/);
  assert.match(native,/setAttribute\('aria-label'/);
  assert.match(native,/\.textContent=line/);
  assert.match(native,/marker\.setLngLat\(\[point\.coords!\[1\],point\.coords!\[0\]\]\)/);
  assert.match(native,/marker\.remove\(\)/);
  assert.match(native,/visibleRainSamples/);
  assert.doesNotMatch(native,/innerHTML|\.setHTML\(/);
});

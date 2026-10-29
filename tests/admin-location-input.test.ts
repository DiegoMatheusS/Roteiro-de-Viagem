import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminLocationInput as parse } from '../src/services/adminPlaceLocation';

test('admin extrai coordenadas do link de mapa OSM do usuário', () => {
  assert.deepEqual(parse('https://www.openstreetmap.org/#map=18/-22.394664/-47.571815'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'visão do OpenStreetMap'
  });
  assert.deepEqual(parse('https://www.openstreetmap.org/?mlat=-22.394664&mlon=-47.571815#map=17/-22/-47'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'marcador do OpenStreetMap'
  });
});
test('links de objetos OSM são encaminhados à importação verificada', () => {
  assert.deepEqual(parse('https://www.openstreetmap.org/node/456#map=18/-22/-47'), {
    type: 'osm-object', reference: 'https://www.openstreetmap.org/node/456'
  });
  assert.deepEqual(parse('way/321'), { type: 'osm-object', reference: 'https://www.openstreetmap.org/way/321' });
});
test('endereços por coordenadas e links de mapas conhecidos', () => {
  assert.deepEqual(parse('-22.394664,-47.571815'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'coordenadas digitadas'
  });
  assert.deepEqual(parse('-22,394664; -47,571815'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'coordenadas digitadas'
  });
  assert.deepEqual(parse('https://www.google.com/maps/@-22.394664,-47.571815,17z'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'Google Maps'
  });
  assert.deepEqual(parse('https://www.waze.com/ul?ll=-22.394664%2C-47.571815&navigate=yes'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'Waze'
  });
  assert.deepEqual(parse('https://maps.apple.com/?ll=-22.394664,-47.571815'), {
    type: 'coordinates', lat: -22.394664, lng: -47.571815, origin: 'Apple Maps'
  });
});
test('URL suspeita e posição fora do globo não são aceitas', () => {
  for (const value of [
    'https://openstreetmap.org.evil.test/#map=18/-22.394664/-47.571815',
    'http://www.openstreetmap.org/#map=18/-22.394664/-47.571815',
    'https://www.openstreetmap.org/#map=18/91/-47.571815',
    'https://www.google.com/maps/@-22,-200,17z',
    'https://www.openstreetmap.org/node/0',
    'https://maps.app.goo.gl/short-link-with-no-coordinates',
    '91,20', 'texto sem coordenadas'
  ]) assert.equal(parse(value), null, value);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySpeed, parsePostedSpeedLimit, resolveRoadSpeedLimit } from '../src/services/roadSpeedLimit';

test('velocímetro usa azul, laranja, vermelho ou neutro conforme limite conhecido', () => {
  assert.equal(classifySpeed(45, 60), 'normal');
  assert.equal(classifySpeed(55, 60), 'attention');
  assert.equal(classifySpeed(56, 60), 'attention');
  assert.equal(classifySpeed(60, 60), 'attention');
  assert.equal(classifySpeed(60.1, 60), 'excess');
  assert.equal(classifySpeed(75, 60), 'excess');
  assert.equal(classifySpeed(65, null), 'neutral');
  assert.equal(classifySpeed(null, 60), 'neutral');
});

test('somente limites numéricos sinalizados; mph convertido; sem valores presumidos', () => {
  assert.equal(parsePostedSpeedLimit('60'), 60);
  assert.equal(parsePostedSpeedLimit('80 km/h'), 80);
  assert.equal(parsePostedSpeedLimit('30 mph'), 48);
  for (const value of ['BR:urban', 'signals', 'none', '50;60', '', '500', '0']) {
    assert.equal(parsePostedSpeedLimit(value), null, value);
  }
});

test('não associa limite a estrada distante, via ambígua ou sem tag', () => {
  const location: [number,number] = [-23.55, -46.63];
  const north = (value: number) => -23.55 + value / 110540;
  const way = (meters: number, maxspeed?: string) => ({
    type: 'way', tags: { highway: 'residential', ...(maxspeed ? { maxspeed } : {}) },
    geometry: [{ lat: north(meters), lon: -46.631 }, { lat: north(meters), lon: -46.629 }]
  });
  assert.equal(resolveRoadSpeedLimit([way(2, '60')], location, 5), 60);
  assert.equal(resolveRoadSpeedLimit([way(30, '60')], location, 5), null);
  assert.equal(resolveRoadSpeedLimit([way(2, '60')], location, 40), null);
  assert.equal(resolveRoadSpeedLimit([way(2)], location, 5), null);
  assert.equal(resolveRoadSpeedLimit([way(2, '60'), way(5, '40')], location, 5), null);
});

test('interface preserva contraste dos botões e usa velocímetro comum nos mapas', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const rgb = (hex: string) => {
    const channels = [1,3,5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const light = channels.map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2];
  };
  for (const hex of ['#1d4ed8', '#047857', '#1e40af', '#065f46', '#475569']) {
    assert.ok((1.05 / (rgb(hex) + 0.05)) >= 4.5, 'contraste insuficiente: ' + hex);
    assert.ok(css.includes(hex), 'tom de ação não declarado: ' + hex);
  }
  const home = readFileSync(new URL('../src/components/NavigationHome.tsx', import.meta.url), 'utf8');
  const trip = readFileSync(new URL('../src/components/ActiveTripModal.tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../src/components/MapTab.tsx', import.meta.url), 'utf8');
  assert.match(home, /Escolher KM/);
  assert.match(home, /Escolher horas/);
  for (const component of [home, trip, map]) assert.match(component, /<Speedometer/);
});

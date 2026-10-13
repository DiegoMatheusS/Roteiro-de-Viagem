import test from 'node:test';
import assert from 'node:assert/strict';
import { stationOpeningStatus } from '../server/openingHours';

const station = { lat: -23.55, lng: -46.63, openingHoursVerifiedAt: new Date().toISOString() } as any;
test('unverified hours are never treated as proof that the station is open', () => {
  assert.equal(stationOpeningStatus({ ...station, openingHours: '24/7', openingHoursVerifiedAt: undefined }), 'unverified');
  assert.equal(stationOpeningStatus({ ...station, openingHours: '24/7' }), 'open');
});
test('verified hours use the station timezone, not server timezone', () => {
  const hours = { ...station, openingHours: '08:00-18:00' };
  assert.equal(stationOpeningStatus(hours, new Date('2026-10-13T12:00:00Z')), 'open');
  assert.equal(stationOpeningStatus(hours, new Date('2026-10-13T22:00:00Z')), 'closed');
});
test('unknown, outdated or unsupported schedules remain unknown', () => {
  assert.equal(stationOpeningStatus({ ...station, openingHours: 'PH off; 08:00-18:00' }, new Date()), 'unknown');
  assert.equal(stationOpeningStatus({ ...station, openingHours: 'texto desconhecido' }, new Date()), 'unknown');
  assert.equal(stationOpeningStatus({ ...station, openingHours: '24/7', openingHoursVerifiedAt: new Date(Date.now() - 31 * 86400000).toISOString() }), 'unverified');
});

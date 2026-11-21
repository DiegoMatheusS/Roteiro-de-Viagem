import assert from 'node:assert/strict';
import test from 'node:test';
import type { RoadAlert } from '../src/types/roadAlerts';
import { mapPositionIsOnHighway, radarAlertsInView, RADAR_MIN_ZOOM } from '../src/services/mapRadarVisibility';

const gps: [number, number] = [-23.55, -46.63];
const camera = (id: string, kmNorth: number): RoadAlert => ({
  id, kind: 'speed_camera', source: 'pardal', lat: gps[0] + kmNorth / 111.195, lng: gps[1],
  note: '', createdAt: '2026-11-20', expiresAt: '2026-12-20'
});
const markers: RoadAlert[] = [
  camera('near', 2.9), camera('city-limit', 3.1), camera('road-limit', 7.9), camera('far', 8.1),
  { ...camera('pothole', 20), kind: 'pothole', source: undefined }
];

test('radar pins use the GPS radius and disappear below the zoom threshold', () => {
  const ids = (zoom: number, highway: boolean, position?: [number, number]) =>
    radarAlertsInView(markers, position, zoom, highway).map(alert => alert.id);
  assert.deepEqual(ids(15, false, gps), ['near', 'pothole']);
  assert.deepEqual(ids(15, true, gps), ['near', 'city-limit', 'road-limit', 'pothole']);
  assert.deepEqual(ids(RADAR_MIN_ZOOM - 0.01, true, gps), ['pothole']);
  assert.deepEqual(ids(15, true), ['pothole']);
});

test('the wider radar radius requires a clear match with the current highway', () => {
  const road = (roadClass: string, offset: number) => ({
    properties: { class: roadClass },
    geometry: { type: 'LineString', coordinates: [
      [gps[1] + offset, gps[0] - 0.001], [gps[1] + offset, gps[0] + 0.001]
    ] }
  });
  const map = (...features: ReturnType<typeof road>[]) => ({
    getStyle: () => ({ layers: [{ id: 'highway_motorway', type: 'line' }] }),
    project: () => ({ x: 80, y: 120 }),
    queryRenderedFeatures: () => features
  } as unknown as NonNullable<Parameters<typeof mapPositionIsOnHighway>[0]>);
  assert.equal(mapPositionIsOnHighway(map(road('motorway', 0)), gps, 8), true);
  assert.equal(mapPositionIsOnHighway(map(road('motorway', 0), road('minor', 0.00003)), gps, 8), false);
  assert.equal(mapPositionIsOnHighway(map(road('motorway', 0.0005)), gps, 8), false);
  assert.equal(mapPositionIsOnHighway(map(road('motorway', 0)), gps, 60), false);
});

import type { DeviceLocation } from './locationService';

export interface GpsTrackingState {
  distanceKm: number;
  lastPosition: DeviceLocation | null;
}

export function createGpsTrackingState(): GpsTrackingState {
  return { distanceKm: 0, lastPosition: null };
}

export function distanceBetweenKm(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLng = (b[1] - a[1]) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function recordGpsPosition(state: GpsTrackingState, position: DeviceLocation): GpsTrackingState {
  if (position.accuracyMeters > 50) return { ...state, lastPosition: null };
  const previous = state.lastPosition;
  if (!previous) return { ...state, lastPosition: position };
  const seconds = (position.timestamp - previous.timestamp) / 1000;
  if (seconds <= 0) return state;
  const distanceKm = distanceBetweenKm(previous.coords, position.coords);
  // Do not connect gaps, jumps or GPS drift to the measured distance.
  if (seconds > 30 || distanceKm / seconds * 3600 > 200) return { ...state, lastPosition: position };
  const noiseMeters = Math.max(3, (previous.accuracyMeters + position.accuracyMeters) / 2);
  if (distanceKm * 1000 < noiseMeters) return state;
  return { distanceKm: state.distanceKm + distanceKm, lastPosition: position };
}

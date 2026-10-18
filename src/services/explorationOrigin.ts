import type { DeviceLocation } from './locationService';

/** The map tracker already accepts a position up to 60 seconds old.
 * Reuse the same valid reading while starting a route instead of blocking on
 * a second high-accuracy GPS request which may take 15 seconds or time out.
 * Older/inaccurate readings still require a new GPS fix.
 */
export function recentExplorationOrigin(
  position: DeviceLocation | null | undefined,
  now = Date.now()
): [number, number] | null {
  if (!position || !Number.isFinite(position.timestamp) ||
      !Number.isFinite(position.accuracyMeters) || position.accuracyMeters > 100 ||
      position.accuracyMeters < 0 ||
      !position.coords.every(Number.isFinite) ||
      Math.abs(position.coords[0]) > 90 || Math.abs(position.coords[1]) > 180) return null;
  const age = now - position.timestamp;
  return age >= -5000 && age <= 60000 ? position.coords : null;
}

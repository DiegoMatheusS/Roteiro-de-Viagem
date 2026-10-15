import { distanceBetweenKm } from './gpsTracking';

type Point = [number, number];
export interface RouteProgress {
  passed: Point[];
  ahead: Point[];
  progressKm: number;
  distanceFromRouteMeters: number;
  onRoute: boolean;
}

// Match an accurate live GPS fix to a road segment, not simply the trip odometer.
// This also handles segment interiors and circuits that revisit the same junction.
export function splitNavigationRoute(
  route: Point[], position: Point | null | undefined,
  accuracyMeters = Infinity, expectedProgressKm?: number
): RouteProgress {
  const inactive: RouteProgress = { passed: [], ahead: route, progressKm: 0, distanceFromRouteMeters: Infinity, onRoute: false };
  if (route.length < 2 || !position || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 ||
      accuracyMeters > 60 || !position.every(Number.isFinite)) return inactive;

  let distanceAlong = 0;
  let best: { index: number; point: Point; along: number; distance: number; score: number } | null = null;
  const expected = typeof expectedProgressKm === 'number' && Number.isFinite(expectedProgressKm)
    ? Math.max(0, expectedProgressKm) : undefined;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const lat = position[0] * Math.PI / 180;
    const dx = (b[1] - a[1]) * Math.cos(lat);
    const dy = b[0] - a[0];
    const denominator = dx * dx + dy * dy;
    if (denominator < 1e-17) continue;
    const projected = Math.max(0, Math.min(1, ((position[1] - a[1]) * Math.cos(lat) * dx + (position[0] - a[0]) * dy) / denominator));
    const point: Point = [a[0] + (b[0] - a[0]) * projected, a[1] + (b[1] - a[1]) * projected];
    const deviation = distanceBetweenKm(position, point);
    const segmentLength = distanceBetweenKm(a, b);
    const along = distanceAlong + segmentLength * projected;
    // Tie-breaking around loop intersections must not shift a displayed completed section backwards.
    const score = deviation + (expected !== undefined ? Math.min(2, Math.abs(along - expected)) * 0.001 : 0);
    if (!best || score < best.score) best = { index: i, point, along, distance: deviation, score };
    distanceAlong += segmentLength;
  }
  if (!best || best.distance > Math.max(0.055, accuracyMeters / 1000 + 0.025)) return inactive;
  return {
    passed: [...route.slice(0, best.index + 1), best.point],
    ahead: [best.point, ...route.slice(best.index + 1)],
    progressKm: best.along,
    distanceFromRouteMeters: Math.round(best.distance * 1000),
    onRoute: true
  };
}

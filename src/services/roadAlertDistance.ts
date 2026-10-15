import { distanceBetweenKm } from './gpsTracking';
import type { RoadAlert } from '../types/roadAlerts';

type Coordinates = [number, number];
function nearestProgress(point: Coordinates, route: Coordinates[], expectedKm = 0) {
  let accumulated = 0, bestDistance = Infinity, bestAlong = 0, bestScore = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const factor = Math.max(0.01, Math.abs(Math.cos(point[0] * Math.PI / 180)));
    const ax = (point[1] - a[1]) * 111.195 * factor;
    const ay = (point[0] - a[0]) * 111.195;
    const dx = (b[1] - a[1]) * 111.195 * factor;
    const dy = (b[0] - a[0]) * 111.195;
    const fraction = Math.max(0, Math.min(1, (ax * dx + ay * dy) / Math.max(1e-9, dx * dx + dy * dy)));
    const distance = Math.hypot(ax - fraction * dx, ay - fraction * dy);
    const segmentLength = distanceBetweenKm(a, b);
    const along = accumulated + fraction * segmentLength;
    // Different legs of a circular journey can cross the same coordinate.
    const score = distance + Math.abs(along - expectedKm) * 0.08;
    if (score < bestScore) { bestScore = score; bestDistance = distance; bestAlong = along; }
    accumulated += segmentLength;
  }
  return { distanceKm: bestDistance, alongKm: bestAlong };
}
export function upcomingRoadAlert(
  alerts: RoadAlert[], route: Coordinates[], position?: Coordinates, travelledKm = 0,
  totalKm = 0, currentTime = Date.now()
): { alert: RoadAlert; distanceKm: number } | null {
  if (!position || route.length < 2) return null;
  let routeLength = 0;
  for (let i = 1; i < route.length; i++) routeLength += distanceBetweenKm(route[i-1],route[i]);
  const expected = totalKm > 0 ? Math.min(1, travelledKm / totalKm) * routeLength : 0;
  const user = nearestProgress(position, route, expected);
  if (user.distanceKm > 0.4) return null;
  const upcoming = alerts
    .filter(alert => Date.parse(alert.expiresAt) > currentTime)
    .map(alert => {
      const found = nearestProgress([alert.lat, alert.lng], route, expected + 1);
      return { alert, distanceKm: found.alongKm - user.alongKm, lateralKm: found.distanceKm };
    })
    .filter(item => item.lateralKm <= 0.35 && item.distanceKm >= -0.15 && item.distanceKm <= 3)
    .sort((a,b) => a.distanceKm - b.distanceKm);
  return upcoming[0] ? { alert: upcoming[0].alert, distanceKm: Math.max(0, upcoming[0].distanceKm) } : null;
}

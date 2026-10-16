import { distanceBetweenKm } from './gpsTracking';

/** Split the actual road segment at the GPS projection, including sparse routes.
 * Recorded distance disambiguates overlapping outbound/return legs.
 */
export function splitRouteAtPosition(
  path: [number, number][], location?: [number, number], travelledKm = 0, totalKm = 0
): { travelled: [number, number][]; remaining: [number, number][] } {
  const unchanged = { travelled: [] as [number, number][], remaining: path };
  if (path.length < 2 || !location) return unchanged;
  const lengths = path.slice(1).map((point, index) => distanceBetweenKm(path[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const expected = totalKm > 0 ? Math.min(1, Math.max(0, travelledKm / totalKm)) * total : 0;
  const scale = Math.max(0.01, Math.cos(location[0] * Math.PI / 180));
  let along = 0, bestScore = Infinity, distance = Infinity, segment = 0, fraction = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = path[i], b = path[i + 1];
    const dx = (b[1] - a[1]) * 111.195 * scale, dy = (b[0] - a[0]) * 111.195;
    const px = (location[1] - a[1]) * 111.195 * scale, py = (location[0] - a[0]) * 111.195;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    const lateral = Math.hypot(px - t * dx, py - t * dy);
    const score = lateral + Math.abs(along + t * lengths[i] - expected) * 0.00001;
    if (score < bestScore) { bestScore = score; distance = lateral; segment = i; fraction = t; }
    along += lengths[i];
  }
  if (distance > 0.3) return unchanged;
  // Snap within three meters to avoid duplicate vertices at maneuver points.
  if (fraction * lengths[segment] < 0.003) return { travelled: path.slice(0, segment + 1), remaining: path.slice(segment) };
  if ((1 - fraction) * lengths[segment] < 0.003) return { travelled: path.slice(0, segment + 2), remaining: path.slice(segment + 1) };
  const a = path[segment], b = path[segment + 1];
  const projected: [number, number] = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return { travelled: [...path.slice(0, segment + 1), projected], remaining: [projected, ...path.slice(segment + 1)] };
}

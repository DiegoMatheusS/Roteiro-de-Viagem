/**
 * Limites explícitos do OpenStreetMap. Nunca deduzir o limite pelo tipo da via.
 * Sem tag maxspeed inequívoca ou sem associação GPS/via, retornar null.
 */
export interface RoadWay {
  type?: string;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

const ROAD_TYPES = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'residential', 'unclassified', 'living_street', 'service'
]);

export function parsePostedSpeedLimit(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,3})(?:\s*(km\/h|kmh|kph|mph))?$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  const limit = match[2]?.toLowerCase() === 'mph' ? number * 1.609344 : number;
  return limit >= 5 && limit <= 160 ? Math.round(limit) : null;
}

export function distanceMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const lat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dx = (a[1] - b[1]) * 111320 * Math.cos(lat);
  const dy = (a[0] - b[0]) * 110540;
  return Math.hypot(dx, dy);
}

function distanceToWay(coords: readonly [number, number], way: RoadWay): number {
  const geometry = way.geometry;
  if (!geometry || geometry.length < 2) return Infinity;
  const latitude = coords[0] * Math.PI / 180;
  const unitX = 111320 * Math.cos(latitude);
  const unitY = 110540;
  let closest = Infinity;
  for (let index = 1; index < geometry.length; index++) {
    const previous = geometry[index - 1], next = geometry[index];
    const ax = (previous.lon - coords[1]) * unitX;
    const ay = (previous.lat - coords[0]) * unitY;
    const bx = (next.lon - coords[1]) * unitX;
    const by = (next.lat - coords[0]) * unitY;
    const dx = bx - ax, dy = by - ay;
    const fraction = dx * dx + dy * dy > 0
      ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
      : 0;
    closest = Math.min(closest, Math.hypot(ax + fraction * dx, ay + fraction * dy));
  }
  return closest;
}

export function resolveRoadSpeedLimit(
  ways: readonly RoadWay[],
  position: readonly [number, number],
  accuracyMeters: number
): number | null {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > 25 || accuracyMeters < 0) return null;
  const matches = ways
    .filter(way => way.type === 'way' && ROAD_TYPES.has(way.tags?.highway || ''))
    .map(way => ({ way, distance: distanceToWay(position, way) }))
    .filter(item => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance);

  const nearest = matches[0];
  if (!nearest || nearest.distance > Math.min(22, 10 + accuracyMeters)) return null;
  const limit = parsePostedSpeedLimit(nearest.way.tags?.maxspeed);
  if (limit === null) return null;
  // Em cruzamentos e vias paralelas, não atribuir limite à via errada.
  const competing = matches.slice(1).find(item =>
    item.distance <= nearest.distance + 8 &&
    parsePostedSpeedLimit(item.way.tags?.maxspeed) !== limit
  );
  return competing ? null : limit;
}

export type SpeedState = 'neutral' | 'normal' | 'attention' | 'excess';
export function classifySpeed(speedKmH: number | null, postedLimitKmH: number | null): SpeedState {
  if (speedKmH === null || postedLimitKmH === null ||
      !Number.isFinite(speedKmH) || !Number.isFinite(postedLimitKmH) ||
      speedKmH < 0 || postedLimitKmH <= 0) return 'neutral';
  if (speedKmH > postedLimitKmH) return 'excess';
  return postedLimitKmH - speedKmH <= 5 ? 'attention' : 'normal';
}

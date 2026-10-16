import { createHash } from 'node:crypto';
import type { FuelDatabase } from './db';
import { roadRoute, type Coordinates, type MapFetch } from './maps';

// Routes may include a person's home or precise GPS origin.
// Cache only in the owner's account; never expose to the public geocoding index.
const FRESH_MS = 24 * 3600_000;
const FALLBACK_MS = 48 * 3600_000;
type Road = Awaited<ReturnType<typeof roadRoute>>;
export type CachedRoad = Road & { stored?: true; stale?: true };

function isRoad(value: unknown, geometryRequired: boolean): value is Road {
  if (!value || typeof value !== 'object') return false;
  const road = value as Partial<Road>;
  return typeof road.distanceKm === 'number' && Number.isFinite(road.distanceKm) &&
    road.distanceKm >= 0 && Array.isArray(road.legsKm) &&
    road.legsKm.length > 0 && road.legsKm.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
    (road.legsSeconds === null || Array.isArray(road.legsSeconds) &&
      road.legsSeconds.length === road.legsKm.length &&
      road.legsSeconds.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) &&
    (!geometryRequired || Array.isArray(road.geometry) && road.geometry.length >= 2 &&
      road.geometry.every(point => Array.isArray(point) && point.length === 2 &&
        point.every(n => typeof n === 'number' && Number.isFinite(n))));
}

export async function privateRoadRoute(
  db: FuelDatabase, ownerId: string | undefined,
  points: Coordinates[], fetcher: MapFetch = fetch, withGeometry = true
): Promise<CachedRoad> {
  if (!ownerId) return roadRoute(points, fetcher, withGeometry);
  const origin = process.env.ROUTING_URL || 'https://router.project-osrm.org';
  const key = createHash('sha256').update(JSON.stringify({
    origin, withGeometry, points: points.map(pair => pair.map(value => Number(value.toFixed(6))))
  })).digest('hex');
  const row = db.prepare('SELECT result_json,created_at FROM user_route_cache WHERE user_id=? AND cache_key=?')
    .get(ownerId, key) as { result_json: string; created_at: string } | undefined;
  let previous: Road | undefined, ageMs = Infinity;
  if (row) {
    ageMs = Date.now() - Date.parse(row.created_at);
    try {
      const parsed: unknown = JSON.parse(row.result_json);
      if (isRoad(parsed, withGeometry) && ageMs >= 0 && ageMs <= FALLBACK_MS) previous = parsed;
    } catch { /* corrupt cache never overrides verified routing */ }
  }
  if (previous && ageMs <= FRESH_MS) return { ...previous, stored: true };
  try {
    const result = await roadRoute(points, fetcher, withGeometry);
    const serialized = JSON.stringify(result);
    // Limit per-account disk use; a large route still works but is not saved again.
    if (Buffer.byteLength(serialized) <= 350_000) {
      // Cache storage is best-effort: a full volume must never prevent navigation.
      try {
        const date = new Date().toISOString();
        db.prepare(`INSERT INTO user_route_cache(user_id,cache_key,result_json,created_at)
          VALUES(?,?,?,?) ON CONFLICT(user_id,cache_key) DO UPDATE SET
          result_json=excluded.result_json,created_at=excluded.created_at`)
          .run(ownerId, key, serialized, date);
        db.prepare('DELETE FROM user_route_cache WHERE created_at<?')
          .run(new Date(Date.now() - FALLBACK_MS).toISOString());
        db.prepare(`DELETE FROM user_route_cache WHERE user_id=? AND cache_key NOT IN
          (SELECT cache_key FROM user_route_cache WHERE user_id=? ORDER BY created_at DESC LIMIT 18)`)
          .run(ownerId, ownerId);
        // The existing Railway data volume is 500 MB; cap cache across all travelers.
        db.prepare(`DELETE FROM user_route_cache WHERE rowid NOT IN
          (SELECT rowid FROM user_route_cache ORDER BY created_at DESC LIMIT 400)`).run();
      } catch { /* provider result remains valid even when cache storage is unavailable */ }
    }
    return result;
  } catch (error) {
    const message = (error as Error).message;
    // Never serve an obsolete route when the router explicitly says the road is invalid.
    if (previous && !/não foi encontrado um trajeto|resposta de trajeto incompleta|desenho rodoviário/i.test(message))
      return { ...previous, stored: true, stale: true };
    throw error;
  }
}

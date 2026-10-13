import { createHash } from 'node:crypto';
import type { FuelDatabase } from './db';

export type Coordinates = [number, number];
export type MapFetch = typeof fetch;

export function validateCoordinates(value: unknown): Coordinates[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) throw new Error('Escolha um trajeto com até 25 pontos.');
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) throw new Error('Localização inválida.');
    return [point[0], point[1]] as Coordinates;
  });
}

export async function discoverStations(db: FuelDatabase, points: Coordinates[], radiusKm = 5, mapFetch: MapFetch = fetch) {
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0);
  const key = createHash('sha256').update(JSON.stringify([sampled.map(p => p.map(c => Number(c.toFixed(3)))), radiusKm])).digest('hex');
  const cached = db.prepare('SELECT * FROM map_queries WHERE id=?').get(key) as any;
  if (cached && Date.now() - Date.parse(cached.updated_at) < 6 * 3600000) return { stationIds: JSON.parse(cached.station_ids) as string[], cached: true, mapUnavailable: false };
  const query = `[out:json][timeout:20];(${sampled.map(p => `nwr["amenity"="fuel"](around:${radiusKm * 1000},${p[0]},${p[1]});`).join('')});out center tags;`;
  try {
    const response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
      method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RoteiroDeViagem/1.0 (fuel-station-discovery)' }
    });
    if (!response.ok) throw new Error('Mapas indisponíveis.');
    const payload = await response.json() as any;
    if (!Array.isArray(payload.elements)) throw new Error('Resposta de mapas inválida.');
    const now = new Date().toISOString();
    const ids: string[] = [];
    const statement = db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,opening_hours,map_updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,source_url=excluded.source_url,
      hours_verified_at=CASE WHEN stations.opening_hours=excluded.opening_hours THEN stations.hours_verified_at ELSE NULL END,
      opening_hours=excluded.opening_hours,map_updated_at=excluded.map_updated_at`);
    for (const element of payload.elements.slice(0, 200)) {
      if (!['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.tags?.amenity !== 'fuel') continue;
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const id = `osm:${element.type}:${element.id}`;
      const tags = element.tags;
      const name = String(tags.name || tags.brand || tags.operator || 'Posto sem nome no mapa').slice(0, 150);
      const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(', ').slice(0, 250);
      statement.run(id, name, lat, lng, address, `https://www.openstreetmap.org/${element.type}/${element.id}`, String(tags.opening_hours || '').slice(0, 200) || null, now);
      ids.push(id);
    }
    db.prepare('INSERT OR REPLACE INTO map_queries VALUES(?,?,?)').run(key, JSON.stringify(ids), now);
    return { stationIds: ids, cached: false, mapUnavailable: false };
  } catch {
    if (cached) return { stationIds: JSON.parse(cached.station_ids) as string[], cached: true, mapUnavailable: true };
    throw new Error('Não foi possível carregar postos reais. Tente novamente em alguns minutos.');
  }
}

const routeCache = new Map<string, { time: number; result: { distanceKm: number; legsKm: number[]; legsSeconds: number[] | null } }>();

export async function roadRoute(points: Coordinates[], mapFetch: MapFetch = fetch) {
  if (points.length < 2) throw new Error('Escolha origem e destino para comparar postos.');
  const coordinates = points.map(p => `${p[1]},${p[0]}`).join(';');
  const baseUrl = process.env.ROUTING_URL || 'https://router.project-osrm.org';
  const key = `${baseUrl}:${coordinates}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.time < 15 * 60000) return cached.result;
  const response = await mapFetch(`${baseUrl}/route/v1/driving/${coordinates}?overview=false&steps=false`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RoteiroDeViagem/1.0' } });
  if (!response.ok) throw new Error('Cálculo de desvio indisponível.');
  const payload = await response.json() as any;
  const route = payload.routes?.[0];
  if (payload.code !== 'Ok' || !Number.isFinite(route?.distance) || !Array.isArray(route?.legs)) throw new Error('Não foi encontrado um trajeto rodoviário.');
  if (route.legs.length !== points.length - 1 || !route.legs.every((leg: any) => Number.isFinite(leg.distance) && leg.distance >= 0)) throw new Error('Resposta de trajeto incompleta.');
  const result = { distanceKm: route.distance / 1000, legsKm: route.legs.map((leg: any) => leg.distance / 1000) as number[], legsSeconds: route.legs.every((leg: any) => Number.isFinite(leg.duration) && leg.duration >= 0) ? route.legs.map((leg: any) => leg.duration) as number[] : null };
  if (routeCache.size > 200) routeCache.clear();
  routeCache.set(key, { time: Date.now(), result });
  return result;
}

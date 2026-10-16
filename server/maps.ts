import { createHash } from 'node:crypto';
import type { FuelDatabase } from './db';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import type { Place } from '../src/types/admin';

export type Coordinates = [number, number];
export type MapFetch = typeof fetch;

export function nearbyPlaceRows(db: FuelDatabase, points: Coordinates[], radiusKm: number) {
  const params: number[] = [];
  const boxes = points.map(point => {
    const latDelta = radiusKm / 110, lngDelta = Math.min(180, radiusKm / (110 * Math.max(0.001, Math.cos(point[0] * Math.PI / 180))));
    const low = point[1] - lngDelta, high = point[1] + lngDelta;
    params.push(point[0] - latDelta, point[0] + latDelta);
    if (lngDelta >= 180) return '(lat BETWEEN ? AND ?)';
    params.push(low < -180 ? low + 360 : low, high > 180 ? high - 360 : high);
    return `(lat BETWEEN ? AND ? AND ${low < -180 || high > 180 ? '(lng>=? OR lng<=?)' : 'lng BETWEEN ? AND ?'})`;
  });
  return (db.prepare(`SELECT * FROM stations WHERE active=1 AND (${boxes.join(' OR ')}) ORDER BY managed DESC LIMIT 1000`).all(...params) as any[])
    .filter(place => points.some(point => distanceBetweenKm(point, [place.lat, place.lng]) <= radiusKm));
}

export function nearbyManagedStations(db: FuelDatabase, points: Coordinates[], radiusKm: number) {
  return nearbyPlaceRows(db, points, radiusKm).filter(place => place.kind === 'fuel' && place.managed).map(place => place.id as string);
}

export async function lookupMapPlace(reference: string, mapFetch: MapFetch = fetch): Promise<Place> {
  const match = reference.trim().match(/^(?:osm:)?(node|way|relation)[:/](\d{1,16})$/) ||
    reference.trim().match(/^https:\/\/(?:www\.)?openstreetmap\.org\/(node|way|relation)\/(\d{1,16})(?:[?#].*)?$/);
  if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0) throw new Error('Cole o link de um estabelecimento do OpenStreetMap (node, way ou relation).');
  const response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
    method: 'POST', body: new URLSearchParams({ data: `[out:json][timeout:20];${match[1]}(${match[2]});out center tags;` }),
    signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!response.ok) throw new Error('Não foi possível verificar o estabelecimento no mapa. Tente novamente.');
  const payload = await response.json() as any;
  const element = payload.elements?.find((item: any) => item.type === match[1] && item.id === Number(match[2]));
  const place = placeFromMapElement(element);
  if (!place) throw new Error('Esse ponto não identifica um estabelecimento ou atração válida.');
  return place;
}

export function placeFromMapElement(element: any): Place | null {
  if (!element || !['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0) return null;
  const tags = element?.tags;
  const lat = element?.lat ?? element?.center?.lat;
  const lng = element?.lon ?? element?.center?.lon;
  if (!tags || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !(tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.waterway === 'waterfall' || tags.barrier === 'toll_booth' || tags.highway === 'toll_gantry' || tags.natural === 'beach' || tags.historic || tags.highway === 'path')) return null;
  const kind: Place['kind'] = tags.amenity === 'fuel' ? 'fuel'
    : tags.barrier === 'toll_booth' || tags.highway === 'toll_gantry' ? 'toll'
    : tags.waterway === 'waterfall' ? 'waterfall'
    : ['supermarket', 'convenience', 'grocery'].includes(tags.shop) ? 'supermarket'
    : tags.shop === 'mall' ? 'shopping'
    : ['restaurant', 'fast_food', 'food_court'].includes(tags.amenity) ? 'restaurant'
    : tags.amenity === 'cafe' ? 'cafe'
    : tags.tourism === 'guest_house' ? 'inn'
    : ['hotel', 'motel', 'hostel', 'camp_site'].includes(tags.tourism) ? 'hotel'
    : tags.tourism === 'viewpoint' ? 'viewpoint'
    : tags.tourism === 'museum' ? 'museum'
    : tags.tourism === 'attraction' ? 'attraction'
    : tags.historic ? 'historic'
    : tags.leisure === 'nature_reserve' ? 'nature_reserve'
    : tags.leisure === 'park' ? 'park'
    : tags.natural === 'beach' ? 'beach'
    : tags.highway === 'path' ? 'trail'
    : 'other';
  return { id: `osm:${element.type}:${element.id}`, kind, name: String(tags.name || tags.brand || tags.operator || 'Estabelecimento sem nome no mapa').slice(0, 150), lat, lng,
    address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(', ').slice(0, 250),
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`, description: '', website: /^https?:\/\//.test(tags.website || '') ? String(tags.website).slice(0, 300) : '', phone: String(tags.phone || '').slice(0, 50),
    active: true, openingHours: String(tags.opening_hours || '').slice(0, 200) || undefined };
}

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
  const visible = (ids: string[]) => [...new Set([...ids, ...nearbyManagedStations(db, points, radiusKm)])].filter(id => db.prepare("SELECT id FROM stations WHERE id=? AND active=1 AND kind='fuel'").get(id));
  if (cached && Date.now() - Date.parse(cached.updated_at) < 6 * 3600000) return { stationIds: visible(JSON.parse(cached.station_ids)), cached: true, mapUnavailable: false };
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
      opening_hours=excluded.opening_hours,map_updated_at=excluded.map_updated_at WHERE stations.managed=0`);
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
    return { stationIds: visible(ids), cached: false, mapUnavailable: false };
  } catch {
    if (cached) return { stationIds: visible(JSON.parse(cached.station_ids)), cached: true, mapUnavailable: true };
    const managed = nearbyManagedStations(db, points, radiusKm);
    if (managed.length) return { stationIds: managed, cached: true, mapUnavailable: true };
    throw new Error('Não foi possível carregar postos reais. Tente novamente em alguns minutos.');
  }
}

const routeCache = new Map<string, { time: number; result: { distanceKm: number; legsKm: number[]; legsSeconds: number[] | null; geometry: Coordinates[] | null } }>();

export async function roadRoute(points: Coordinates[], mapFetch: MapFetch = fetch, withGeometry = false) {
  if (points.length < 2) throw new Error('Escolha origem e destino para comparar postos.');
  const coordinates = points.map(p => `${p[1]},${p[0]}`).join(';');
  const baseUrl = process.env.ROUTING_URL || 'https://router.project-osrm.org';
  const key = `${baseUrl}:${coordinates}:${withGeometry}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.time < 15 * 60000) return cached.result;
  const response = await mapFetch(`${baseUrl}/route/v1/driving/${coordinates}?overview=${withGeometry ? 'full&geometries=geojson' : 'false'}&steps=false`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RoteiroDeViagem/1.0' } });
  if (!response.ok) throw new Error('Cálculo de desvio indisponível.');
  const payload = await response.json() as any;
  const route = payload.routes?.[0];
  if (payload.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance < 0 || !Array.isArray(route?.legs)) throw new Error('Não foi encontrado um trajeto rodoviário.');
  if (route.legs.length !== points.length - 1 || !route.legs.every((leg: any) => Number.isFinite(leg.distance) && leg.distance >= 0)) throw new Error('Resposta de trajeto incompleta.');
  const geometry = withGeometry && Array.isArray(route.geometry?.coordinates) && route.geometry.coordinates.length >= 2 && route.geometry.coordinates.every((p: any) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    ? route.geometry.coordinates.map((p: number[]) => [p[1], p[0]] as Coordinates) : null;
  if (withGeometry && !geometry) throw new Error('O provedor não retornou o desenho rodoviário da rota.');
  const result = { distanceKm: route.distance / 1000, legsKm: route.legs.map((leg: any) => leg.distance / 1000) as number[], legsSeconds: route.legs.every((leg: any) => Number.isFinite(leg.duration) && leg.duration >= 0) ? route.legs.map((leg: any) => leg.duration) as number[] : null, geometry };
  if (routeCache.size > 200) routeCache.clear();
  routeCache.set(key, { time: Date.now(), result });
  return result;
}

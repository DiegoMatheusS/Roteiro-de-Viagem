import { createHash } from 'node:crypto';
import type { FuelDatabase } from './db';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import type { Place } from '../src/types/admin';
import type { NavigationManeuver } from '../src/types';
import type {PlaceBounds} from '../src/services/mapPlaceViewport';

export type Coordinates = [number, number];
export type MapFetch = typeof fetch;

/** A bounded camera query prevents the beginning of a long route from using
 * the entire result budget while the driver is looking at another town. */
export function viewportPlaceRows(db:FuelDatabase,value:unknown,includeManagedFuel=false){
  const bounds=value as PlaceBounds|null;
  if(!bounds||typeof bounds!=='object')throw new Error('Área do mapa inválida.');
  const {south,north,west,east}=bounds;
  if(![south,north,west,east].every(v=>typeof v==='number'&&Number.isFinite(v))||
    south>=north||south< -90||north>90||Math.abs(west)>180||Math.abs(east)>180)
    throw new Error('Área do mapa inválida.');
  const width=west<=east?east-west:360-west+east;
  if(north-south>10||width<=0||width>10)throw new Error('Aproxime o mapa para consultar os lugares.');
  const longitude=west<=east?'lng BETWEEN ? AND ?':'(lng>=? OR lng<=?)';
  return db.prepare(`SELECT * FROM stations WHERE active=1 AND (kind<>'fuel'${includeManagedFuel?' OR managed=1':''})
    AND lat BETWEEN ? AND ? AND ${longitude}
    ORDER BY managed DESC,ABS(lat-?) LIMIT 1000`)
    .all(south,north,west,east,(south+north)/2) as any[];
}

export function nearbyPlaceRows(db: FuelDatabase, points: Coordinates[], radiusKm: number, excludeFuel = false) {
  const params: number[] = [];
  const boxes = points.map(point => {
    const latDelta = radiusKm / 110, lngDelta = Math.min(180, radiusKm / (110 * Math.max(0.001, Math.cos(point[0] * Math.PI / 180))));
    const low = point[1] - lngDelta, high = point[1] + lngDelta;
    params.push(point[0] - latDelta, point[0] + latDelta);
    if (lngDelta >= 180) return '(lat BETWEEN ? AND ?)';
    params.push(low < -180 ? low + 360 : low, high > 180 ? high - 360 : high);
    return `(lat BETWEEN ? AND ? AND ${low < -180 || high > 180 ? '(lng>=? OR lng<=?)' : 'lng BETWEEN ? AND ?'})`;
  });
  // Distinct tourist search must exclude fuels BEFORE SQL LIMIT, or dense cities
  // can return only fuel stations and hide imported attractions.
  const filter = excludeFuel ? " AND kind<>'fuel'" : '';
  const order = excludeFuel ? 'managed DESC, ABS(lat-?) + ABS(lng-?)' : 'managed DESC';
  const sortParams = excludeFuel ? [points[0][0], points[0][1]] : [];
  return (db.prepare(`SELECT * FROM stations WHERE active=1${filter} AND (${boxes.join(' OR ')}) ORDER BY ${order} LIMIT 1000`).all(...params, ...sortParams) as any[])
    .filter(place => points.some(point => distanceBetweenKm(point, [place.lat, place.lng]) <= radiusKm));
}

export function nearbyManagedStations(db: FuelDatabase, points: Coordinates[], radiusKm: number) {
  return nearbyPlaceRows(db, points, radiusKm).filter(place => place.kind === 'fuel' && place.managed).map(place => place.id as string);
}

function kindOfScenicRoad(tags: Record<string, any>, geometryType: string) {
  return geometryType === 'way' && tags.scenic === 'yes' &&
    typeof tags.highway === 'string' &&
    /^(secondary|tertiary|unclassified|residential|living_street)$/.test(tags.highway) &&
    tags.access !== 'private' && tags.access !== 'no' &&
    tags.motor_vehicle !== 'no' && tags.motorcar !== 'no' && tags.motorcycle !== 'no';
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
  const tags = element?.tags;
  const lat = element?.lat ?? element?.center?.lat;
  const lng = element?.lon ?? element?.center?.lon;
  if (!tags || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || !(tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.waterway === 'waterfall' || tags.barrier === 'toll_booth' || tags.highway === 'toll_gantry' || tags.natural === 'beach' || tags.historic)) throw new Error('Esse ponto não identifica um estabelecimento ou atração válida.');
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
    : ['museum', 'gallery'].includes(tags.tourism) ? 'museum'
    : tags.amenity === 'theatre' ? 'theatre'
    : kindOfScenicRoad(tags, match[1]) ? 'scenic_road'
    : tags.tourism === 'attraction' ? 'attraction'
    : tags.historic ? 'historic'
    : tags.leisure === 'nature_reserve' ? 'nature_reserve'
    : tags.leisure === 'park' ? 'park'
    : tags.natural === 'beach' ? 'beach'
    : tags.highway === 'path' ? 'trail'
    : 'other';
  return { id: `osm:${match[1]}:${match[2]}`, kind, name: String(tags.name || tags.brand || tags.operator || 'Estabelecimento sem nome no mapa').slice(0, 150), lat, lng,
    address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(', ').slice(0, 250),
    sourceUrl: `https://www.openstreetmap.org/${match[1]}/${match[2]}`, description: '', website: /^https?:\/\//.test(tags.website || '') ? String(tags.website).slice(0, 300) : '', phone: String(tags.phone || '').slice(0, 50),
    active: true, openingHours: String(tags.opening_hours || '').slice(0, 200) || undefined };
}

export function validateCoordinates(value: unknown, maxPoints = 25): Coordinates[] {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 2500) throw new Error('Limite de coordenadas inválido.');
  if (!Array.isArray(value) || value.length < 1 || value.length > maxPoints) throw new Error(`Escolha um trajeto com até ${maxPoints} pontos.`);
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) throw new Error('Localização inválida.');
    return [point[0], point[1]] as Coordinates;
  });
}

// Prevent a failing Overpass instance from holding up every map refresh. Injectable
// fetches in tests are isolated from the production circuit breaker.
let overpassFailures = 0;
let overpassPauseUntil = 0;
export async function discoverStations(db: FuelDatabase, points: Coordinates[], radiusKm = 5, mapFetch: MapFetch = fetch) {
  const sampled = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0);
  const key = createHash('sha256').update(JSON.stringify([sampled.map(p => p.map(c => Number(c.toFixed(3)))), radiusKm])).digest('hex');
  const cached = db.prepare('SELECT * FROM map_queries WHERE id=?').get(key) as any;
  const visible = (ids: string[]) => [...new Set([...ids, ...nearbyManagedStations(db, points, radiusKm)])].filter(id => db.prepare("SELECT id FROM stations WHERE id=? AND active=1 AND kind='fuel'").get(id));
  if (cached && Date.now() - Date.parse(cached.updated_at) < 6 * 3600000) return { stationIds: visible(JSON.parse(cached.station_ids)), cached: true, mapUnavailable: false };
  const degraded = () => ({ stationIds: visible(cached ? JSON.parse(cached.station_ids) : []), cached: Boolean(cached), mapUnavailable: true });
  // When upstream is down, return real cached/admin records with an explicit
  // outage flag instead of HTTP 503 or an invented station list.
  const useBreaker = mapFetch === fetch;
  if (useBreaker && Date.now() < overpassPauseUntil) return degraded();
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
    if (useBreaker) { overpassFailures = 0; overpassPauseUntil = 0; }
    return { stationIds: visible(ids), cached: false, mapUnavailable: false };
  } catch {
    if (useBreaker && ++overpassFailures >= 2) {
      overpassPauseUntil = Date.now() + 2 * 60000;
      overpassFailures = 0;
    }
    return degraded();
  }
}

const routeCache = new Map<string, { time: number; result: { distanceKm: number; legsKm: number[]; legsSeconds: number[] | null; geometry: Coordinates[] | null; routeSteps: NavigationManeuver[] } }>();

export async function roadRoute(points: Coordinates[], mapFetch: MapFetch = fetch, withGeometry = false) {
  if (points.length < 2) throw new Error('Escolha origem e destino para comparar postos.');
  const coordinates = points.map(p => `${p[1]},${p[0]}`).join(';');
  const baseUrl = process.env.ROUTING_URL || 'https://router.project-osrm.org';
  const key = `${baseUrl}:${coordinates}:${withGeometry}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.time < 15 * 60000) return cached.result;
  const response = await mapFetch(`${baseUrl}/route/v1/driving/${coordinates}?overview=${withGeometry ? 'full&geometries=geojson' : 'false'}&steps=${withGeometry ? 'true' : 'false'}`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RoteiroDeViagem/1.0' } });
  if (!response.ok) throw new Error('Cálculo de desvio indisponível.');
  const payload = await response.json() as any;
  const route = payload.routes?.[0];
  if (payload.code !== 'Ok' || !Number.isFinite(route?.distance) || route.distance < 0 || !Array.isArray(route?.legs)) throw new Error('Não foi encontrado um trajeto rodoviário.');
  if (route.legs.length !== points.length - 1 || !route.legs.every((leg: any) => Number.isFinite(leg.distance) && leg.distance >= 0)) throw new Error('Resposta de trajeto incompleta.');
  const geometry = withGeometry && Array.isArray(route.geometry?.coordinates) && route.geometry.coordinates.length >= 2 && route.geometry.coordinates.every((p: any) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    ? route.geometry.coordinates.map((p: number[]) => [p[1], p[0]] as Coordinates) : null;
  if (withGeometry && !geometry) throw new Error('O provedor não retornou o desenho rodoviário da rota.');
  let travelledMeters = 0;
  const routeSteps: NavigationManeuver[] = withGeometry ? route.legs.flatMap((leg: any) => Array.isArray(leg.steps) ? leg.steps : [])
    .map((step: any) => {
      const currentKm = travelledMeters / 1000;
      travelledMeters += Number.isFinite(step.distance) ? step.distance : 0;
      const location = step.maneuver?.location;
      if (!Array.isArray(location) || !Number.isFinite(location[0]) || !Number.isFinite(location[1])) return null;
      return { coords: [location[1], location[0]] as Coordinates, distanceFromStartKm: currentKm,
        type: String(step.maneuver?.type || ''), modifier: String(step.maneuver?.modifier || ''),
        name: String(step.name || '').slice(0, 120) };
    }).filter((step: any) => step !== null) : [];
  const result = { routeSteps, distanceKm: route.distance / 1000, legsKm: route.legs.map((leg: any) => leg.distance / 1000) as number[], legsSeconds: route.legs.every((leg: any) => Number.isFinite(leg.duration) && leg.duration >= 0) ? route.legs.map((leg: any) => leg.duration) as number[] : null, geometry };
  if (routeCache.size > 200) routeCache.clear();
  routeCache.set(key, { time: Date.now(), result });
  return result;
}

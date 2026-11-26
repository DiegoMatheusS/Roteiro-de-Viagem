import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { ApiError, asyncRoute, clientIp, validate } from './http';
import { nearbyPlaceRows, roadRoute, validateCoordinates, type Coordinates, type MapFetch } from './maps';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { sampleRoutePath } from '../src/types/itinerary';
import type { PoliceRoute } from '../src/types/policeRoute';

const SEARCH_RADIUS_KM = 50;
const MAX_CANDIDATES = 6;
const UNAVAILABLE = 'Não foi possível consultar a rota policial agora. Tente novamente.';
const names = new Intl.Collator('pt-BR', { sensitivity: 'base' });

interface PoliceFacility {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

type Station = PoliceRoute['station'];
type DiscoveredStation = Station & { osmId?: string };
type RegisteredStation = Station & { active: boolean };

function sameStation(a: Station, b: Station): boolean {
  return names.compare(a.name, b.name) === 0 &&
    distanceBetweenKm(a.coords, b.coords) < 0.05;
}

async function discoverPoliceStations(origin: Coordinates, mapFetch: MapFetch): Promise<DiscoveredStation[]> {
  const [lat, lon] = origin.map(value => value.toFixed(4));
  const query = `[out:json][timeout:8];nwr["amenity"="police"]["access"!~"^(private|no)$"](around:${SEARCH_RADIUS_KM * 1000},${lat},${lon});out center tags;`;
  const response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RoteiroDeViagem/1.0' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(UNAVAILABLE);
  const { elements, remark } = await response.json() as { elements?: PoliceFacility[]; remark?: string };
  if (!Array.isArray(elements) || remark) throw new Error(UNAVAILABLE);
  const candidates: DiscoveredStation[] = [];
  for (const element of elements) {
    const tags = element?.tags;
    if (tags?.amenity !== 'police' || tags.access === 'private' || tags.access === 'no') continue;
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) ||
        !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const coords: Coordinates = [lat, lon];
    if (distanceBetweenKm(origin, coords) > SEARCH_RADIUS_KM) continue;
    const label = [tags.name, tags.operator].find(value => typeof value === 'string' && value.trim());
    const osmId = element.type && ['node', 'way', 'relation'].includes(element.type) &&
      Number.isSafeInteger(element.id) ? `osm:${element.type}:${element.id}` : undefined;
    candidates.push({ name: label?.trim().slice(0, 150) || 'Posto policial', coords, osmId });
  }
  return candidates;
}

function selectPoliceStations(db: FuelDatabase, origin: Coordinates, discovered: DiscoveredStation[]): Station[] {
  const registered: RegisteredStation[] = nearbyPlaceRows(db, [origin], SEARCH_RADIUS_KM, {
    kind: 'police', includeInactive: true
  }).filter(row => row.managed).map(row => ({ name: row.name, coords: [row.lat, row.lng], active: Boolean(row.active) }));

  // A record imported by its OSM link can have revised coordinates or be disabled.
  const adminOverride = db.prepare("SELECT id FROM stations WHERE id=? AND managed=1 AND (kind='police' OR active=0)");
  const external = discovered.filter(station => !(station.osmId && adminOverride.get(station.osmId)) &&
    !registered.some(place => sameStation(place, station)));
  const byDistance = [...registered.filter(place => place.active), ...external]
    .map(station => ({ station, distance: distanceBetweenKm(origin, station.coords) }))
    .sort((a, b) => a.distance - b.distance);

  // OSM can map the same unit both as a point and as the building around it.
  const stations: Station[] = [];
  for (const { station } of byDistance) {
    if (stations.some(place => sameStation(place, station))) continue;
    stations.push({ name: station.name, coords: station.coords });
    if (stations.length === MAX_CANDIDATES) break;
  }
  return stations;
}

export function registerPoliceRoute(app: Express, db: FuelDatabase, mapFetch: MapFetch,
  limit: (key: string, max: number, ms: number) => void) {
  app.post('/api/sos/police-route', asyncRoute(async (req, res) => {
    const [origin] = validate(() => validateCoordinates([req.body?.originCoords], 1));
    limit(`sos-police-route:${clientIp(req)}`, 6, 60_000);
    const timeout = AbortSignal.timeout(21_000);
    const fetchWithinDeadline: MapFetch = (url, options) => mapFetch(url, {
      ...options, signal: options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout
    });
    const discovered = await discoverPoliceStations(origin, fetchWithinDeadline).catch(() => null);
    const stations = selectPoliceStations(db, origin, discovered ?? []);
    if (!stations.length) {
      if (!discovered) throw new ApiError(UNAVAILABLE, 503);
      throw new ApiError('Nenhuma delegacia ou posto policial encontrado na região.', 404);
    }
    const results = await Promise.allSettled(stations.map(async (station): Promise<PoliceRoute> => {
      const road = await roadRoute([origin, station.coords], fetchWithinDeadline, true);
      const path = road.geometry;
      if (!path || distanceBetweenKm(path[0], origin) > 0.5 ||
          distanceBetweenKm(path[path.length - 1], station.coords) > 0.35) throw new Error(UNAVAILABLE);
      return { station, distanceKm: road.distanceKm, routePath: sampleRoutePath(path, 2500) };
    }));
    const routes = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const nearest = routes.sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (!nearest) throw new ApiError('Não foi possível traçar uma rota por estrada até uma unidade policial.', 503);
    res.json(nearest);
  }));
}

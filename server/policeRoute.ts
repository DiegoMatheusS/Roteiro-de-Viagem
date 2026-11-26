import type { Express } from 'express';
import { ApiError, asyncRoute, clientIp, validate } from './http';
import { roadRoute, validateCoordinates, type Coordinates, type MapFetch } from './maps';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { sampleRoutePath } from '../src/types/itinerary';
import type { PoliceRoute } from '../src/types/policeRoute';

const SEARCH_RADIUS_KM = 50;
const MAX_CANDIDATES = 6;
const UNAVAILABLE = 'Não foi possível consultar a rota policial agora. Tente novamente.';

interface PoliceFacility {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function nearbyStations(origin: Coordinates, mapFetch: MapFetch): Promise<PoliceRoute['station'][]> {
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
  const candidates = [];
  for (const element of elements) {
    const tags = element?.tags;
    if (tags?.amenity !== 'police' || tags.access === 'private' || tags.access === 'no') continue;
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) ||
        !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const coords: Coordinates = [lat, lon];
    const distanceKm = distanceBetweenKm(origin, coords);
    if (distanceKm > SEARCH_RADIUS_KM) continue;
    const label = [tags.name, tags.operator].find(value => typeof value === 'string' && value.trim());
    candidates.push({ name: label?.trim().slice(0, 150) || 'Posto policial', coords, distanceKm });
  }
  // OSM can map the same unit both as a point and as the building around it.
  const stations: PoliceRoute['station'][] = [];
  for (const { name, coords } of candidates.sort((a, b) => a.distanceKm - b.distanceKm)) {
    if (stations.some(station => station.name === name && distanceBetweenKm(station.coords, coords) < 0.05)) continue;
    stations.push({ name, coords });
    if (stations.length === MAX_CANDIDATES) break;
  }
  return stations;
}

export function registerPoliceRoute(app: Express, mapFetch: MapFetch, limit: (key: string, max: number, ms: number) => void) {
  app.post('/api/sos/police-route', asyncRoute(async (req, res) => {
    const [origin] = validate(() => validateCoordinates([req.body?.originCoords], 1));
    limit(`sos-police-route:${clientIp(req)}`, 6, 60_000);
    const timeout = AbortSignal.timeout(21_000);
    const fetchWithinDeadline: MapFetch = (url, options) => mapFetch(url, {
      ...options, signal: options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout
    });
    const stations = await nearbyStations(origin, fetchWithinDeadline).catch(() => {
      throw new ApiError(UNAVAILABLE, 503);
    });
    if (!stations.length) throw new ApiError('Nenhuma delegacia ou posto policial encontrado na região.', 404);
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

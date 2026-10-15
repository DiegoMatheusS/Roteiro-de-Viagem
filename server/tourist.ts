import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { clientIp, ApiError, asyncRoute, validate } from './http';
import { roadRoute, validateCoordinates, type Coordinates, type MapFetch } from './maps';
import { sampleRoutePath } from '../src/types/itinerary';
import type { RouteStop } from '../src/types';

type Interest = 'panoramico' | 'gastronomico' | 'museus' | 'historico' | 'natureza';
type Candidate = { id: string; name: string; coords: Coordinates; category: RouteStop['category']; interest: Interest; sourceUrl: string; address: string };
const interests: Interest[] = ['panoramico', 'gastronomico', 'museus', 'historico', 'natureza'];

function distanceKm(a: Coordinates, b: Coordinates): number {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}

function candidateFromOsm(record: any): Candidate | null {
  const tags = record?.tags;
  const kind = record?.type;
  if (!tags || !['node', 'way', 'relation'].includes(kind) || !Number.isSafeInteger(record.id) || record.id <= 0) return null;
  const name = typeof tags.name === 'string' ? tags.name.trim().slice(0, 150) : '';
  const lat = kind === 'node' ? record.lat : record.center?.lat;
  const lng = kind === 'node' ? record.lon : record.center?.lon;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  let category: RouteStop['category'];
  let interest: Interest;
  if (tags.tourism === 'viewpoint') { category = 'mirante'; interest = 'panoramico'; }
  else if (['museum', 'gallery'].includes(tags.tourism)) { category = 'museu'; interest = 'museus'; }
  else if (tags.historic || tags.tourism === 'attraction') { category = 'monumento'; interest = 'historico'; }
  else if (['restaurant', 'cafe'].includes(tags.amenity)) { category = 'restaurante'; interest = 'gastronomico'; }
  else if (['park', 'nature_reserve'].includes(tags.leisure) || tags.tourism === 'picnic_site') { category = 'parque'; interest = 'natureza'; }
  else return null;
  return { id: `osm:${kind}:${record.id}`, name, coords: [lat, lng], category, interest,
    address: [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ').slice(0, 350),
    sourceUrl: `https://www.openstreetmap.org/${kind}/${record.id}` };
}

export function registerTouristRoutes(app: Express, options: { db: FuelDatabase; mapFetch?: MapFetch; limit: (key: string, max: number, window: number) => void }) {
  const { db, limit } = options;
  const mapFetch = options.mapFetch || fetch;

  app.post('/api/routes/tourist', asyncRoute(async (req, res) => {
    limit(`tourist:${clientIp(req)}`, 6, 60000);
    const origin = validate(() => validateCoordinates([req.body.originCoords]))[0];
    const mode: 'km' | 'hours' = req.body.mode;
    const target = req.body.target;
    if (!['km', 'hours'].includes(mode) || typeof target !== 'number' || !Number.isFinite(target) ||
        target < (mode === 'km' ? 10 : 0.5) || target > (mode === 'km' ? 500 : 12)) {
      throw new ApiError('Informe uma distância de 10 a 500 km ou duração de 30 minutos a 12 horas.');
    }
    const tripType = req.body.tripType;
    if (!['round_trip', 'one_way'].includes(tripType)) throw new ApiError('Escolha ida e volta ou só ida.');
    if (!Array.isArray(req.body.interests) || req.body.interests.length > 5 ||
        req.body.interests.some((item: unknown) => !interests.includes(item as Interest))) throw new ApiError('Seleção de atrações inválida.');
    const selected = new Set<Interest>(req.body.interests.length ? req.body.interests : interests);
    // Radius is bounded; the public Overpass service is for light use, not production traffic.
    const estimatedKm = mode === 'km' ? target : target * 45;
    const radiusM = Math.round(Math.max(4000, Math.min(50000, estimatedKm * (tripType === 'round_trip' ? 300 : 650))));
    const query = `[out:json][timeout:18];(
      nwr(around:${radiusM},${origin[0]},${origin[1]})["tourism"~"^(viewpoint|attraction|museum|gallery|picnic_site)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["amenity"~"^(restaurant|cafe)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["leisure"~"^(park|nature_reserve)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["historic"]["name"];
    );out center 100;`;
    let response: Response;
    try {
      response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
        method: 'POST', body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'RoteiroDeViagem/1.0 (tourist-route-planning)', 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } catch { throw new ApiError('Não foi possível consultar atrações reais agora. Tente novamente.', 503); }
    if (!response.ok) throw new ApiError('O serviço de atrações está indisponível. Tente novamente.', 503);
    let records: unknown;
    try { records = (await response.json() as any)?.elements; } catch { throw new ApiError('O serviço de atrações retornou dados inválidos.', 503); }
    if (!Array.isArray(records)) throw new ApiError('O serviço de atrações retornou dados inválidos.', 503);

    const candidates = [...new Map(records.slice(0, 200).map(candidateFromOsm)
      .filter((place: Candidate | null): place is Candidate => !!place && selected.has(place.interest) &&
        distanceKm(origin, place.coords) >= 0.8 && distanceKm(origin, place.coords) <= radiusM / 1000 + 2)
      .map((place: Candidate) => [place.id, place] as const)).values()];
    if (!candidates.length) throw new ApiError('Não encontramos atrações verificáveis nessa região para montar o passeio. Tente outros interesses ou uma distância diferente.', 422);
    // Spread shortlisted candidates across interests and directions instead of taking the first OSM results.
    const idealDistance = Math.min(radiusM / 1000, estimatedKm * (tripType === 'round_trip' ? 0.27 : 0.72));
    candidates.sort((a, b) => Math.abs(distanceKm(origin, a.coords) - idealDistance) - Math.abs(distanceKm(origin, b.coords) - idealDistance));
    const shortlist: Candidate[] = [];
    for (const place of candidates) {
      if (shortlist.some(prev => distanceKm(prev.coords, place.coords) < 1.5)) continue;
      shortlist.push(place);
      if (shortlist.length >= 9) break;
    }
    // Each candidate is verified by the road router; there is no straight-line fallback.
    const attempts: Candidate[][] = shortlist.slice(0, 6).map(place => [place]);
    for (let a = 0; a < Math.min(5, shortlist.length); a++) {
      const other = shortlist.find((place, index) => index !== a && distanceKm(place.coords, shortlist[a].coords) > 2 &&
        place.interest !== shortlist[a].interest);
      if (other) attempts.push([shortlist[a], other]);
    }
    let best: { selected: Candidate[]; score: number; road: Awaited<ReturnType<typeof roadRoute>>; totalMinutes: number } | null = null;
    for (const points of attempts.slice(0, 11)) {
      const path = [origin, ...points.map(place => place.coords), ...(tripType === 'round_trip' ? [origin] : [])];
      try {
        const road = await roadRoute(path, mapFetch, true);
        if (!road.geometry || !road.legsSeconds) continue;
        const drivingMinutes = Math.ceil(road.legsSeconds.reduce((sum, item) => sum + item, 0) / 60);
        const totalMinutes = drivingMinutes + points.length * 20;
        const actual = mode === 'km' ? road.distanceKm : totalMinutes;
        const desired = mode === 'km' ? target : target * 60;
        const ratio = actual / desired;
        // Avoid misleading routes drastically shorter/longer than requested.
        if (ratio < 0.55 || ratio > 1.5) continue;
        const score = Math.abs(ratio - 1) + (ratio > 1.1 ? (ratio - 1.1) * 0.5 : 0) +
          (points.length === 1 ? 0.07 : 0);
        if (!best || score < best.score) best = { selected: points, score, road, totalMinutes };
      } catch { /* Skip candidates unreachable using the real road router. */ }
    }
    if (!best) throw new ApiError('Não encontramos um percurso rodoviário próximo do limite escolhido. Tente outra distância, duração ou região.', 422);

    // Persist OSM identities so the selected tourist stops survive user edits and itinerary recalculation.
    const insert = db.prepare('INSERT OR IGNORE INTO locations VALUES(?,?,?,?,?,?,?,?)');
    for (const place of best.selected) {
      insert.run(place.id, place.name, place.address, place.coords[0], place.coords[1], place.sourceUrl, place.category, new Date().toISOString());
    }
    const actual = mode === 'km' ? best.road.distanceKm : best.totalMinutes;
    const desired = mode === 'km' ? target : target * 60;
    const warnings: string[] = [];
    if (Math.abs(actual - desired) / desired > 0.1) {
      warnings.push(`O roteiro real tem ${best.road.distanceKm.toFixed(1)} km e aproximadamente ${best.totalMinutes} minutos, diferente da sua preferência. Confira antes de iniciar.`);
    }
    if (tripType === 'round_trip') warnings.push('O roteiro retorna ao ponto inicial. Alguns trechos podem se repetir dependendo das estradas disponíveis.');
    const destination = tripType === 'round_trip' ? origin : best.selected.at(-1)!.coords;
    const stops = best.selected.map((place, index) => ({
      id: `tourist-${index}-${place.id}`, name: place.name, lat: place.coords[0], lng: place.coords[1],
      category: place.category, sourceUrl: place.sourceUrl, description: place.address || 'Atração identificada no OpenStreetMap',
      recommendedMinutes: 20, type: 'suggested' as const, locationId: place.id
    }));
    res.json({
      title: tripType === 'round_trip' ? 'Passear e voltar — atrações reais' : `Passeio turístico até ${best.selected.at(-1)!.name}`,
      destinationName: tripType === 'round_trip' ? 'Retorno ao ponto de partida' : best.selected.at(-1)!.name,
      destinationCoords: destination,
      isCircular: tripType === 'round_trip',
      distanceKm: Number(best.road.distanceKm.toFixed(2)),
      durationMinutes: best.totalMinutes,
      routePath: sampleRoutePath(best.road.geometry!, 2500),
      waypoints: [origin, ...best.selected.map(place => place.coords), ...(tripType === 'round_trip' ? [origin] : [])],
      stops, warnings, routingSource: 'OSRM', tollsStatus: 'unknown'
    });
  }));
}

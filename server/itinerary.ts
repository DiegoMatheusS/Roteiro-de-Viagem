import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { ApiError, asyncRoute, validate, now } from './http';
import { roadRoute, validateCoordinates, nearbyPlaceRows, type MapFetch, type Coordinates } from './maps';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { createHash } from 'node:crypto';
import { sampleRoutePath, type LocationSelection, type MandatoryStop, type SuggestedStop } from '../src/types/itinerary';

const locationDto = (row: any): LocationSelection => ({ id: row.id, name: row.name, address: row.address, coords: [row.lat, row.lng], sourceUrl: row.source_url, category: row.category || row.kind });
export function registerItineraryRoutes(app: Express, options: { db: FuelDatabase; mapFetch?: MapFetch; limit: (key: string, max: number, window: number) => void }) {
  const { db, limit } = options;
  const mapFetch = options.mapFetch || fetch;
  let geocodingBusy = false, lastSearch = 0;
  const findLocation = (id: unknown) => {
    if (typeof id !== 'string' || id.length > 100) throw new ApiError('Escolha uma localização real na busca.');
    const place = db.prepare('SELECT * FROM stations WHERE id=?').get(id) as any;
    if (place && !place.active) throw new ApiError('Um estabelecimento escolhido foi retirado do mapa. Edite essa parada.');
    const row = place || db.prepare('SELECT * FROM locations WHERE id=?').get(id);
    if (!row) throw new ApiError('Localização não encontrada. Pesquise e selecione novamente.');
    return locationDto(row);
  };
  app.get('/api/locations/search', asyncRoute(async (req, res) => {
    limit(`geocoding:${req.ip}`, 15, 60000);
    const q = String(req.query.q || '').trim();
    if (q.length < 3 || q.length > 150) throw new ApiError('Pesquise um nome ou endereço de 3 a 150 caracteres.');
    const bias = req.query.lat !== undefined && req.query.lng !== undefined ? validate(() => validateCoordinates([[Number(req.query.lat), Number(req.query.lng)]]))[0] : undefined;
    const local = (db.prepare("SELECT * FROM stations WHERE active=1 AND (name LIKE ? OR address LIKE ?) ORDER BY name LIMIT 8").all(`%${q}%`, `%${q}%`) as any[]).map(locationDto);
    const key = createHash('sha256').update(JSON.stringify([q.toLowerCase(), bias?.map(v => Number(v.toFixed(2))), process.env.GEOCODING_URL || 'https://photon.komoot.io'])).digest('hex');
    const cached = db.prepare('SELECT * FROM geocoding_queries WHERE id=?').get(key) as any;
    const merge = (ids: string[]) => [...new Map([...local, ...ids.flatMap(id => { try { return [findLocation(id)]; } catch { return []; } })].map(item => [item.id, item])).values()].slice(0, 10);
    if (cached && Date.now() - Date.parse(cached.updated_at) < 86400000) { res.json({ results: merge(JSON.parse(cached.location_ids)), cached: true }); return; }
    // Explicit searches only, one upstream request at a time and at least one second apart.
    if (geocodingBusy || Date.now() - lastSearch < 1000) {
      if (local.length) { res.json({ results: local, limited: true }); return; }
      throw new ApiError('A busca está ocupada. Aguarde um instante e tente novamente.', 429);
    }
    geocodingBusy = true; lastSearch = Date.now();
    try {
      const url = new URL('/api/', process.env.GEOCODING_URL || 'https://photon.komoot.io');
      url.searchParams.set('q', q); url.searchParams.set('limit', '8');
      if (bias) { url.searchParams.set('lat', String(bias[0])); url.searchParams.set('lon', String(bias[1])); }
      const response = await mapFetch(url.toString(), { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'RoteiroDeViagem/1.0 (user-place-search)', 'Accept-Language': 'pt-BR,pt;q=0.9' } });
      if (!response.ok) throw new Error('Busca indisponível.');
      const payload = await response.json() as any;
      if (!Array.isArray(payload.features)) throw new Error('Resposta inválida.');
      const ids: string[] = [];
      const insert = db.prepare('INSERT OR REPLACE INTO locations VALUES(?,?,?,?,?,?,?,?)');
      for (const feature of payload.features.slice(0, 8)) {
        const p = feature.properties?.geocoding || feature.properties;
        const point = feature.geometry?.coordinates;
        const type = ({ N: 'node', W: 'way', R: 'relation', node: 'node', way: 'way', relation: 'relation' } as any)[p?.osm_type];
        if (!type || !Number.isSafeInteger(Number(p.osm_id)) || Number(p.osm_id) <= 0 || !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) continue;
        const id = `osm:${type}:${p.osm_id}`;
        const address = [p.street, p.housenumber, p.city || p.locality, p.state, p.country].filter(Boolean).join(', ').slice(0, 350);
        const name = String(p.name || p.street || p.city || p.locality || address).slice(0, 150);
        if (!name) continue;
        insert.run(id, name, address, point[1], point[0], `https://www.openstreetmap.org/${type}/${p.osm_id}`, String(p.osm_value || p.type || 'local').slice(0, 50), now()); ids.push(id);
        if (p.osm_value === 'fuel') db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,map_updated_at)
          VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,map_updated_at=excluded.map_updated_at WHERE stations.managed=0`)
          .run(id, name, point[1], point[0], address, `https://www.openstreetmap.org/${type}/${p.osm_id}`, now());
      }
      db.prepare('INSERT OR REPLACE INTO geocoding_queries VALUES(?,?,?)').run(key, JSON.stringify(ids), now());
      res.json({ results: merge(ids), cached: false });
    } catch {
      if (local.length || cached) { res.json({ results: merge(cached ? JSON.parse(cached.location_ids) : []), unavailable: true }); return; }
      throw new ApiError('Não foi possível pesquisar locais reais. Tente novamente.', 503);
    } finally { geocodingBusy = false; }
  }));
  app.post('/api/routes/itinerary', asyncRoute(async (req, res) => {
    limit(`itinerary:${req.ip}`, 30, 60000);
    const origin = validate(() => validateCoordinates([req.body.originCoords]))[0];
    const destination = validate(() => validateCoordinates([req.body.destinationCoords]))[0];
    if (!Array.isArray(req.body.manualStops) || req.body.manualStops.length > 12) throw new ApiError('Use até 12 paradas obrigatórias.');
    const stop = (value: any): MandatoryStop => {
      if (!value || typeof value.id !== 'string' || value.id.length > 80 || !Number.isInteger(value.stayMinutes) || value.stayMinutes < 0 || value.stayMinutes > 1440) throw new ApiError('Confira a parada e o tempo de permanência (0 a 1440 minutos).');
      return { id: value.id, location: findLocation(value.locationId), stayMinutes: value.stayMinutes };
    };
    const manualStops = req.body.manualStops.map(stop) as MandatoryStop[];
    if (new Set(manualStops.map(s => s.id)).size !== manualStops.length) throw new ApiError('Cada parada deve ter uma identificação própria.');
    const accepted = req.body.acceptedSuggestions || [];
    if (!Array.isArray(accepted) || accepted.length > 8) throw new ApiError('Use até 8 sugestões aceitas.');
    const acceptedSuggestions = accepted.map((value: any): SuggestedStop => {
      const selected = stop(value);
      if (!Number.isInteger(value.afterIndex) || value.afterIndex < -1 || value.afterIndex >= Math.max(1, manualStops.length)) throw new ApiError('Sequência da sugestão inválida.');
      return { ...selected, afterIndex: value.afterIndex };
    });
    if (new Set([...manualStops, ...acceptedSuggestions].map(stop => stop.id)).size !== manualStops.length + acceptedSuggestions.length) throw new ApiError('Cada parada e sugestão deve ter uma identificação própria.');
    const limits = req.body.limits;
    if (!limits || !['km', 'hours', 'destination'].includes(limits.mode) || limits.mode !== 'destination' && (!Number.isFinite(limits.target) || limits.target <= 0 || limits.target > (limits.mode === 'km' ? 10000 : 168))) throw new ApiError('Confira o limite de distância ou duração.');
    const ordered: (MandatoryStop | SuggestedStop)[] = [];
    ordered.push(...acceptedSuggestions.filter(s => s.afterIndex === -1));
    manualStops.forEach((stop, index) => { ordered.push(stop); ordered.push(...acceptedSuggestions.filter(s => s.afterIndex === index)); });
    if (!manualStops.length) ordered.push(...acceptedSuggestions.filter(s => s.afterIndex === 0));
    const waypoints: Coordinates[] = [origin, ...ordered.map(stop => stop.location.coords!), destination];
    if (req.body.roundTrip === true && distanceBetweenKm(origin, destination) > 0.01) waypoints.push(origin);
    let road;
    try { road = await roadRoute(waypoints, mapFetch, true); } catch (error) { throw new ApiError((error as Error).message, 503); }
    if (!road.legsSeconds) throw new ApiError('O provedor não retornou a duração rodoviária.', 503);
    const drivingMinutes = Math.ceil(road.legsSeconds.reduce((sum, seconds) => sum + seconds, 0) / 60);
    const durationMinutes = drivingMinutes + ordered.reduce((sum, stop) => sum + stop.stayMinutes, 0);
    const exceedsLimit = limits.mode === 'km' && road.distanceKm > limits.target || limits.mode === 'hours' && durationMinutes > limits.target * 60;
    const warnings: string[] = [];
    if (exceedsLimit) warnings.push(`O percurso com as paradas escolhidas exige ${road.distanceKm.toFixed(1)} km e ${durationMinutes} minutos, acima do limite definido. Nenhuma parada obrigatória foi removida.`);
    if (!exceedsLimit && limits.mode === 'km' && road.distanceKm < limits.target * 0.9) warnings.push(`O percurso escolhido usa ${road.distanceKm.toFixed(1)} dos ${limits.target} km desejados. Você pode aceitar sugestões ou adicionar paradas para ampliar o passeio.`);
    const nearPath = sampleRoutePath(road.geometry!, 50);
    const included = new Set(ordered.map(stop => stop.location.id));
    const suggestions: SuggestedStop[] = nearbyPlaceRows(db, nearPath, 3)
      .filter(place => !included.has(place.id)).slice(0, 8).map(place => {
        let closest = 0;
        const base = [origin, ...manualStops.map(stop => stop.location.coords!), destination];
        base.forEach((point, index) => { if (distanceBetweenKm(point, [place.lat, place.lng]) < distanceBetweenKm(base[closest], [place.lat, place.lng])) closest = index; });
        return { id: `suggestion-${place.id}`, location: locationDto(place), stayMinutes: 20, afterIndex: Math.min(Math.max(-1, closest - 1), Math.max(-1, manualStops.length - 1)) };
      });
    res.json({ distanceKm: Number(road.distanceKm.toFixed(2)), drivingMinutes, durationMinutes, routePath: sampleRoutePath(road.geometry!, 2500), waypoints, manualStops, acceptedSuggestions, suggestions, warnings, exceedsLimit, tollsStatus: 'unknown' });
  }));
}

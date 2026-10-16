import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { clientIp, ApiError, asyncRoute, validate, now, auth, user } from './http';
import { validateCoordinates, nearbyPlaceRows, roadRoute, type MapFetch, type Coordinates } from './maps';
import { privateRoadRoute } from './routeCache';
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
  // Only explicitly selected, provider-verified places are saved; never keep raw text searches or GPS history.
  app.post('/api/me/locations', auth, (req, res) => {
    const owner = user(res).id;
    limit(`save-location:${owner}`, 30, 60000);
    const selection = findLocation(req.body?.locationId);
    if (!selection.id || !selection.coords) throw new ApiError('Selecione um local verificado.');
    db.prepare(`INSERT INTO user_saved_locations
      (user_id,location_id,name,address,lat,lng,source_url,category,saved_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,location_id) DO UPDATE SET
        name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,
        source_url=excluded.source_url,category=excluded.category,saved_at=excluded.saved_at`)
      .run(owner, selection.id, selection.name, selection.address || '',
        selection.coords[0], selection.coords[1], selection.sourceUrl || '',
        selection.category || '', now());
    db.prepare(`DELETE FROM user_saved_locations WHERE user_id=? AND location_id NOT IN
      (SELECT location_id FROM user_saved_locations WHERE user_id=? ORDER BY saved_at DESC LIMIT 50)`)
      .run(owner, owner);
    res.status(201).json({ saved: true });
  });
  app.get('/api/me/locations', auth, (_req, res) => {
    const rows = db.prepare('SELECT * FROM user_saved_locations WHERE user_id=? ORDER BY saved_at DESC LIMIT 50')
      .all(user(res).id) as any[];
    res.json({ results: rows.map(locationDto) });
  });
  app.delete('/api/me/locations/:id', auth, (req, res) => {
    if (req.params.id.length > 100) throw new ApiError('Local inválido.');
    db.prepare('DELETE FROM user_saved_locations WHERE user_id=? AND location_id=?')
      .run(user(res).id, req.params.id);
    res.json({ ok: true });
  });
  app.delete('/api/me/locations', auth, (_req, res) => {
    db.prepare('DELETE FROM user_saved_locations WHERE user_id=?').run(user(res).id);
    res.json({ ok: true });
  });
  app.get('/api/locations/search', asyncRoute(async (req, res) => {
    limit(`geocoding:${clientIp(req)}`, 15, 60000);
    const q = String(req.query.q || '').trim();
    if (q.length < 3 || q.length > 150) throw new ApiError('Pesquise um nome ou endereço de 3 a 150 caracteres.');
    const bias = req.query.lat !== undefined && req.query.lng !== undefined ? validate(() => validateCoordinates([[Number(req.query.lat), Number(req.query.lng)]]))[0] : undefined;
    // Public OSM places are indexed once, then reused across users without a provider request.
    // Private selections are visible only to the authenticated owner.
    const escaped = q.replace(/[!%_]/g, token => '!' + token);
    const match = `%${escaped}%`;
    const privateRows = user(res) ? db.prepare(`SELECT * FROM user_saved_locations WHERE user_id=?
      AND (name LIKE ? ESCAPE '!' OR address LIKE ? ESCAPE '!') ORDER BY saved_at DESC LIMIT 10`)
      .all(user(res).id, match, match) as any[] : [];
    const publicRows = db.prepare(`SELECT * FROM locations
      WHERE name LIKE ? ESCAPE '!' OR address LIKE ? ESCAPE '!' ORDER BY updated_at DESC LIMIT 12`)
      .all(match, match) as any[];
    const stationRows = db.prepare(`SELECT * FROM stations WHERE active=1
      AND (name LIKE ? ESCAPE '!' OR address LIKE ? ESCAPE '!') ORDER BY managed DESC,name LIMIT 12`)
      .all(match, match) as any[];
    const local = [...new Map([...privateRows, ...stationRows, ...publicRows]
      .map(row => locationDto(row)).map(place => [place.id, place])).values()].slice(0, 10);
    const key = createHash('sha256').update(JSON.stringify([q.toLowerCase(), bias?.map(v => Number(v.toFixed(2))), process.env.GEOCODING_URL || 'https://photon.komoot.io'])).digest('hex');
    const cached = db.prepare('SELECT * FROM geocoding_queries WHERE id=?').get(key) as any;
    const merge = (ids: string[]) => [...new Map([...local, ...ids.flatMap(id => { try { return [findLocation(id)]; } catch { return []; } })].map(item => [item.id, item])).values()].slice(0, 10);
    if (cached && Date.now() - Date.parse(cached.updated_at) < 86400000) { res.json({ results: merge(JSON.parse(cached.location_ids)), cached: true }); return; }
    // Prefer our growing local address index whenever it has enough useful matches.
    // Exact address searches may return a single verified local match without Photon.
    if (local.length >= 5 || local.some(place => place.address?.toLowerCase() === q.toLowerCase())) {
      res.json({ results: local, cached: true, source: 'local' }); return;
    }
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
  // Alternativas reais: as opções exibidas usam geometrias independentes do OSRM.
  // Sem API de tráfego, não atribuímos congestionamento a qualquer trajeto.
  app.post('/api/routes/alternatives', asyncRoute(async (req, res) => {
    limit(`alternatives:${clientIp(req)}`, 20, 60000);
    const origin = validate(() => validateCoordinates([req.body?.originCoords]))[0];
    const destination = validate(() => validateCoordinates([req.body?.destinationCoords]))[0];
    const base = process.env.ROUTING_URL || 'https://router.project-osrm.org';
    const path = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
    const url = `${base}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    let payload: any;
    try {
      const response = await mapFetch(url, {signal:AbortSignal.timeout(18000),headers:{'User-Agent':'RoteiroDeViagem/1.0'}});
      if (!response.ok) throw new Error('Serviço de rotas indisponível.');
      payload = await response.json();
    } catch { throw new ApiError('Não foi possível consultar rotas rodoviárias agora.', 503); }
    if (payload?.code !== 'Ok' || !Array.isArray(payload.routes)) throw new ApiError('Não foram encontradas rotas rodoviárias verificadas.', 503);
    const options: any[] = [];
    const addOption = (route: any, kind: 'fast'|'alternative'|'tourist', stop?: any) => {
      const coords = route.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return;
      if (coords.some((pair:any) => !Array.isArray(pair) || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1]))) return;
      const routePath = sampleRoutePath(coords.map((pair:number[]) => [pair[1],pair[0]] as Coordinates),2500);
      const signature = [routePath[Math.floor(routePath.length / 3)],routePath[Math.floor(routePath.length * 2 / 3)]].map(point => point.map(v=>v.toFixed(3)).join(':')).join('|');
      if (options.some(opt => opt.signature === signature)) return;
      let progress = 0;
      const routeSteps = (route.legs || []).flatMap((leg:any) => Array.isArray(leg.steps) ? leg.steps : [])
        .map((step:any) => {
          const distanceFromStartKm = progress / 1000;
          progress += Number.isFinite(step.distance) ? step.distance : 0;
          const point = step.maneuver?.location;
          return Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)
            ? { coords:[point[1],point[0]], distanceFromStartKm, type:String(step.maneuver?.type || ''),
                modifier:String(step.maneuver?.modifier || ''), name:String(step.name || '').slice(0,120) } : null;
        }).filter(Boolean);
      options.push({ id:`option-${options.length+1}`, kind, distanceKm:Number((route.distance/1000).toFixed(2)),
        durationMinutes:Math.ceil(route.duration/60), routePath, routeSteps,
        scenicStop:stop ? {name:stop.name,coords:[stop.lat,stop.lng]} : undefined,
        trafficStatus:'unavailable', tollStatus:'unchecked', signature });
    };
    const routes = payload.routes.filter((route:any)=>Number.isFinite(route?.duration)).sort((a:any,b:any)=>a.duration-b.duration);
    for (const route of routes.slice(0,4)) addOption(route,options.length===0?'fast':'alternative');
    // Só chama de turística uma rota que passa por uma atração cadastrada e foi roteada por vias reais.
    if (options.length && distanceBetweenKm(origin,destination) > 4) {
      const midpoint: Coordinates = [(origin[0]+destination[0])/2,(origin[1]+destination[1])/2];
      const touristKinds = new Set(['waterfall','viewpoint','museum','park','attraction','historic','nature_reserve','beach']);
      const poi = nearbyPlaceRows(db,[midpoint],Math.min(15,Math.max(4,distanceBetweenKm(origin,destination)/5)))
        .find((p:any)=>touristKinds.has(p.kind) && distanceBetweenKm(origin,[p.lat,p.lng])>1 && distanceBetweenKm(destination,[p.lat,p.lng])>1);
      if (poi) try {
        const scenic = await roadRoute([origin,[poi.lat,poi.lng],destination],mapFetch,true);
        const scenicRoute = {
          distance:scenic.distanceKm*1000,
          duration:scenic.legsSeconds?.reduce((a,b)=>a+b,0) || 0,
          geometry:{coordinates:scenic.geometry?.map(point=>[point[1],point[0]])},
          legs:[],
        };
        if (scenicRoute.duration>0 && scenicRoute.duration <= routes[0].duration*2
            && scenic.geometry?.length && !options.some(opt=>Math.abs(opt.distanceKm-scenic.distanceKm)<0.1))
          options.push({id:`option-${options.length+1}`,kind:'tourist',distanceKm:Number(scenic.distanceKm.toFixed(2)),
            durationMinutes:Math.ceil(scenicRoute.duration/60),routePath:sampleRoutePath(scenic.geometry,2500),
            routeSteps:scenic.routeSteps||[],scenicStop:{name:poi.name,coords:[poi.lat,poi.lng]},
            trafficStatus:'unavailable',tollStatus:'unchecked'});
      } catch { /* rota turística é opcional; jamais desenhar linha fictícia */ }
    }
    res.json({options:options.map(({signature,...option})=>option),trafficDataAvailable:false});
  }));

  app.post('/api/routes/itinerary', asyncRoute(async (req, res) => {
    limit(`itinerary:${clientIp(req)}`, 30, 60000);
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
    try { road = await privateRoadRoute(db, user(res)?.id, waypoints, mapFetch, true); }
    catch (error) { throw new ApiError((error as Error).message, 503); }
    if (!road.legsSeconds) throw new ApiError('O provedor não retornou a duração rodoviária.', 503);
    const drivingMinutes = Math.ceil(road.legsSeconds.reduce((sum, seconds) => sum + seconds, 0) / 60);
    const durationMinutes = drivingMinutes + ordered.reduce((sum, stop) => sum + stop.stayMinutes, 0);
    const exceedsLimit = limits.mode === 'km' && road.distanceKm > limits.target || limits.mode === 'hours' && durationMinutes > limits.target * 60;
    const warnings: string[] = [];
    if (road.stale) warnings.push('Rota recuperada do histórico da sua conta porque o serviço de mapas está indisponível. O percurso pode estar desatualizado; confirme as condições antes de seguir.');
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
    res.json({ distanceKm: Number(road.distanceKm.toFixed(2)), drivingMinutes, durationMinutes, routePath: sampleRoutePath(road.geometry!, 2500), routeSteps: road.routeSteps || [], waypoints, manualStops, acceptedSuggestions, suggestions, warnings, exceedsLimit, tollsStatus: 'unknown' });
  }));
}

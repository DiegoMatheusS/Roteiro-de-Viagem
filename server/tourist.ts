import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { clientIp, ApiError, asyncRoute, validate, user } from './http';
import { validateCoordinates, nearbyPlaceRows, type Coordinates, type MapFetch } from './maps';
import { privateRoadRoute, type CachedRoad } from './routeCache';
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

const adminTouristKinds: Record<string, { category: RouteStop['category']; interest: Interest }> = {
  waterfall: { category: 'parque', interest: 'natureza' },
  viewpoint: { category: 'mirante', interest: 'panoramico' },
  park: { category: 'parque', interest: 'natureza' },
  square: { category: 'parque', interest: 'natureza' },
  nature_reserve: { category: 'parque', interest: 'natureza' },
  trail: { category: 'parque', interest: 'natureza' },
  beach: { category: 'parque', interest: 'natureza' },
  museum: { category: 'museu', interest: 'museus' },
  theatre: { category: 'monumento', interest: 'historico' },
  scenic_road: { category: 'mirante', interest: 'panoramico' },
  landmark: { category: 'monumento', interest: 'historico' },
  historic: { category: 'monumento', interest: 'historico' },
  attraction: { category: 'monumento', interest: 'historico' }
};

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
  if (tags.amenity === 'theatre') { category = 'monumento'; interest = 'historico'; }
  else if (tags.tourism === 'viewpoint') { category = 'mirante'; interest = 'panoramico'; }
  else if (['museum', 'gallery'].includes(tags.tourism)) { category = 'museu'; interest = 'museus'; }
  else if (tags.waterway === 'waterfall') { category = 'parque'; interest = 'natureza'; }
  else if (kind === 'way' && tags.scenic === 'yes' && typeof tags.highway === 'string' &&
    /^(secondary|tertiary|unclassified|residential|living_street)$/.test(tags.highway) &&
    !['no','private'].includes(tags.access) && tags.motor_vehicle !== 'no' && tags.motorcar !== 'no' && tags.motorcycle !== 'no')
    { category = 'mirante'; interest = 'panoramico'; }
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

  // Move a preview's blue control point and recompute its geometry on actual
  // road network edges. Never return an invented straight-line route.
  app.post('/api/routes/adjust', asyncRoute(async(req,res)=>{
    limit(`route-adjust:${clientIp(req)}`,8,60000);
    const waypoints=validate(()=>validateCoordinates(req.body.waypoints,8));
    if(waypoints.length<3)throw new ApiError('Escolha origem, ponto de ajuste e destino.');
    const road=await privateRoadRoute(db,user(res)?.id,waypoints,mapFetch,true);
    if(!road.geometry || !road.legsSeconds || road.distanceKm<0.03)
      throw new ApiError('Não encontramos estradas acessíveis para essa alteração.',422);
    res.json({
      routePath:sampleRoutePath(road.geometry,2500),
      routeSteps:road.routeSteps||[],
      distanceKm:Number(road.distanceKm.toFixed(2)),
      drivingMinutes:Math.ceil(road.legsSeconds.reduce((a,v)=>a+v,0)/60),
      routingSource:'OSRM',
      stale:Boolean(road.stale)
    });
  }));

  app.post('/api/routes/tourist', asyncRoute(async (req, res) => {
    limit(`tourist:${clientIp(req)}`, 6, 60000);
    const origin = validate(() => validateCoordinates([req.body.originCoords]))[0];
    const mode: 'km' | 'hours' = req.body.mode;
    const target = req.body.target;
    if (!['km', 'hours'].includes(mode) || typeof target !== 'number' || !Number.isFinite(target) ||
        target <= 0 || target > (mode === 'km' ? 500 : 12)) {
      throw new ApiError('Informe um valor acima de zero (até 500 km ou 12 horas).');
    }
    const tripType = req.body.tripType;
    if (!['round_trip', 'one_way'].includes(tripType)) throw new ApiError('Escolha ida e volta ou só ida.');
    if (!Array.isArray(req.body.interests) || req.body.interests.length > 5 ||
        req.body.interests.some((item: unknown) => !interests.includes(item as Interest))) throw new ApiError('Seleção de atrações inválida.');
    // Regeração descarta trajetos já exibidos, sem enviar todo o traçado GPS ao servidor.
    // Limitamos o histórico para evitar payloads excessivos na rota pública.
    const avoidWaypoints: Coordinates[][] = req.body.avoidWaypoints ?? [];
    if (!Array.isArray(avoidWaypoints) || avoidWaypoints.length > 5 ||
        avoidWaypoints.some(path => !Array.isArray(path) || path.length < 2 || path.length > 4 ||
          path.some(coords => !Array.isArray(coords) || coords.length !== 2 ||
            !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) ||
            Math.abs(coords[0]) > 90 || Math.abs(coords[1]) > 180))) {
      throw new ApiError('Histórico de trajetos inválido.');
    }
    const alreadyShown = (path: Coordinates[]) => avoidWaypoints.some(previous =>
      previous.length === path.length &&
      previous.every((point,index) => distanceKm(point,path[index]) < 1.2));
    const visitedWaypoints:Coordinates[][]=req.body.visitedWaypoints??[];
    if(!Array.isArray(visitedWaypoints)||visitedWaypoints.length>5 ||
      visitedWaypoints.some(path=>!Array.isArray(path)||path.length<2||path.length>6||
        path.some(coords=>!Array.isArray(coords)||coords.length!==2 ||
          !Number.isFinite(coords[0])||!Number.isFinite(coords[1])||
          Math.abs(coords[0])>90||Math.abs(coords[1])>180)))
      throw new ApiError('Histórico de roteiros concluídos inválido.');
    const parseIds=(value:unknown,max:number):string[]=>{
      if(value===undefined)return [];
      if(!Array.isArray(value)||value.length>max ||
        value.some(v=>typeof v!=='string'||v.length<1||v.length>100))
        throw new ApiError('Histórico de destinos inválido.');
      return value;
    };
    const visitedIds=new Set(parseIds(req.body.visitedPlaceIds,40));
    const excludedIds=new Set(parseIds(req.body.excludePlaceIds,15));
    const selectedPlaceIds=parseIds(req.body.selectedPlaceIds,3);
    if(new Set(selectedPlaceIds).size!==selectedPlaceIds.length)throw new ApiError('Selecione pontos diferentes.');
    const oldRoute=(path:Coordinates[])=>visitedWaypoints.some(previous=>
      previous.length===path.length &&
      previous.every((point,index)=>distanceKm(point,path[index])<1.2));
    const selected = new Set<Interest>(req.body.interests.length ? req.body.interests : interests);
    // Radius is bounded; the public Overpass service is for light use, not production traffic.
    const estimatedKm = mode === 'km' ? target : target * 45;
    const radiusM = Math.round(Math.max(4000, Math.min(50000, estimatedKm * (tripType === 'round_trip' ? 300 : 650))));
    // Pontos turísticos aprovados no Admin participam da geração, independentemente do Overpass.
    const localRadiusKm = Math.max(radiusM / 1000, Math.min(240, estimatedKm * (tripType === 'round_trip' ? 0.55 : 1)));
    const adminCandidates: Candidate[] = nearbyPlaceRows(db, [origin], localRadiusKm)
      .filter((row: any) => adminTouristKinds[row.kind] && row.name)
      .map((row: any) => ({
        id: row.id, name: row.name, coords: [row.lat, row.lng] as Coordinates,
        category: adminTouristKinds[row.kind].category, interest: adminTouristKinds[row.kind].interest,
        address: row.address, sourceUrl: row.source_url
      }))
      .filter(place => distanceKm(origin, place.coords) >= 0.05);
    // Grow a shared index from previously discovered OSM attractions, not private addresses.
    const span = localRadiusKm / 111;
    const localAttractions = (db.prepare(`SELECT * FROM locations WHERE lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ? ORDER BY updated_at DESC LIMIT 500`)
      .all(origin[0]-span, origin[0]+span, origin[1]-span*2, origin[1]+span*2) as any[])
      .map((place): Candidate | null => {
        const mapping: Record<string, { category: RouteStop['category']; interest: Interest }> = {
          museum: { category: 'museu', interest: 'museus' },
          theatre: { category: 'monumento', interest: 'historico' },
          scenic_road: { category: 'mirante', interest: 'panoramico' },
          viewpoint: { category: 'mirante', interest: 'panoramico' },
          restaurant: { category: 'restaurante', interest: 'gastronomico' },
          cafe: { category: 'restaurante', interest: 'gastronomico' },
          park: { category: 'parque', interest: 'natureza' },
          square: { category: 'parque', interest: 'natureza' },
          nature_reserve: { category: 'parque', interest: 'natureza' },
          attraction: { category: 'monumento', interest: 'historico' },
          historic: { category: 'monumento', interest: 'historico' }
        };
        const matched = mapping[place.category];
        if (!matched || !place.name || !Number.isFinite(place.lat) || !Number.isFinite(place.lng) ||
            distanceKm(origin,[place.lat,place.lng]) > localRadiusKm) return null;
        return { id: place.id, name: place.name, coords: [place.lat,place.lng],
          address: place.address, sourceUrl: place.source_url, ...matched };
      }).filter((place): place is Candidate => !!place);
    const query = `[out:json][timeout:18];(
      nwr(around:${radiusM},${origin[0]},${origin[1]})["tourism"~"^(viewpoint|attraction|museum|gallery|picnic_site)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["amenity"="theatre"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["waterway"="waterfall"]["name"];
      way(around:${radiusM},${origin[0]},${origin[1]})["highway"~"^(secondary|tertiary|unclassified|residential|living_street)$"]["scenic"="yes"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["amenity"~"^(restaurant|cafe)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["leisure"~"^(park|nature_reserve)$"]["name"];
      nwr(around:${radiusM},${origin[0]},${origin[1]})["historic"]["name"];
    );out center 100;`;
    let records: any[] = [];
    let discoveryUnavailable = false;
    // Evita depender de uma consulta pública externa quando o próprio Admin já cadastrou opções.
    if ([...adminCandidates, ...localAttractions].filter(place => selected.has(place.interest)).length < 6) {
      try {
        const response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
          method: 'POST', body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'RoteiroDeViagem/1.0 (tourist-route-planning)', 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (!response.ok) throw new Error('Busca de atrações indisponível');
        const payload = (await response.json() as any)?.elements;
        if (!Array.isArray(payload)) throw new Error('Dados de atrações inválidos');
        records = payload;
      } catch { discoveryUnavailable = true; }
    }
    const osmCandidates = records.slice(0, 200).map(candidateFromOsm)
      .filter((place: Candidate | null): place is Candidate => !!place && selected.has(place.interest) &&
        distanceKm(origin, place.coords) >= 0.1 && distanceKm(origin, place.coords) <= radiusM / 1000 + 2);
    // Store validated public POIs as they are discovered, even if this route uses a different stop.
    const upsertPlace = db.prepare(`INSERT INTO locations(id,name,address,lat,lng,source_url,category,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,
      source_url=excluded.source_url,category=excluded.category,updated_at=excluded.updated_at`);
    const discoveredAt = new Date().toISOString();
    for (const place of osmCandidates) upsertPlace.run(place.id,place.name,place.address,
      place.coords[0],place.coords[1],place.sourceUrl,place.category,discoveredAt);
    const candidates = [...new Map([...adminCandidates.filter(place => selected.has(place.interest)), ...localAttractions.filter(place => selected.has(place.interest)), ...osmCandidates]
      .map((place: Candidate) => [place.id, place] as const)).values()];
    // Explicit choices are verified against our nearby catalog, never trusted coordinates from the client.
    const chosen=selectedPlaceIds.map(id=>adminCandidates.find(place=>place.id===id));
    if(chosen.some(place=>!place))throw new ApiError('Um dos pontos selecionados não está mais disponível nessa região.');
    // Spread shortlisted candidates across interests and directions instead of taking the first OSM results.
    const idealDistance = Math.min(radiusM / 1000, estimatedKm * (tripType === 'round_trip' ? 0.27 : 0.72));
    // New destinations first, then closest to the requested KM / time budget.
    // Previously completed routes remain eligible as a last resort.
    candidates.sort((a,b)=>{
      const score=(p:Candidate)=>
        Math.abs(distanceKm(origin,p.coords)-idealDistance)/Math.max(1,idealDistance) +
        (visitedIds.has(p.id)?0.9:0);
      return score(a)-score(b) || a.id.localeCompare(b.id);
    });
    const shortlist: Candidate[] = [];
    for (const place of candidates) {
      if(excludedIds.has(place.id))continue;
      if (shortlist.some(prev => distanceKm(prev.coords, place.coords) < 1.5)) continue;
      shortlist.push(place);
      if (shortlist.length >= 9) break;
    }
    // Each candidate is verified by the road router; there is no straight-line fallback.
    const attempts: Candidate[][] = selectedPlaceIds.length?[chosen as Candidate[]]:shortlist.slice(0, 6).map(place => [place]);
    for (let a = 0; !selectedPlaceIds.length && a < Math.min(5, shortlist.length); a++) {
      const other = shortlist.find((place, index) => index !== a && distanceKm(place.coords, shortlist[a].coords) > 2 &&
        place.interest !== shortlist[a].interest);
      if (other) attempts.push([shortlist[a], other]);
    }
    let best: { selected: Candidate[]; score: number; road: CachedRoad; totalMinutes: number; path: Coordinates[] } | null = null;
    for (const points of attempts.slice(0, 11)) {
      const path = [origin, ...points.map(place => place.coords), ...(tripType === 'round_trip' ? [origin] : [])];
      if (alreadyShown(path)) continue;
      try {
        const road = await privateRoadRoute(db, user(res)?.id, path, mapFetch, true);
        if (!road.geometry || !road.legsSeconds) continue;
        const drivingMinutes = Math.ceil(road.legsSeconds.reduce((sum, item) => sum + item, 0) / 60);
        const totalMinutes = drivingMinutes + points.length * 20;
        const actual = mode === 'km' ? road.distanceKm : totalMinutes;
        const desired = mode === 'km' ? target : target * 60;
        const ratio = actual / desired;
        // Avoid misleading routes drastically shorter/longer than requested.
        if (ratio < 0.3 || ratio > 2.2) continue;
        const score = Math.abs(ratio - 1) + (ratio > 1.1 ? (ratio - 1.1) * 0.5 : 0) +
          (points.length === 1 ? 0.07 : 0) +
          (points.some(place=>visitedIds.has(place.id)) ? 0.45 : 0) +
          (oldRoute(path) ? 0.65 : 0);
        if (!best || score < best.score) best = { selected: points, score, road, totalMinutes, path };
      } catch { /* Skip candidates unreachable using the real road router. */ }
    }
    if(selectedPlaceIds.length&&!best)throw new ApiError('Não foi possível montar uma rota rodoviária com todos os pontos selecionados dentro da distância ou duração escolhida. Aumente o limite ou remova um ponto.');
    // Sem pontos turísticos suficientes, busca alternativas de estradas reais.
    // Os pontos de passagem são apenas alvos geométricos: o OSRM calcula e valida
    // todo o percurso rodoviário. Nenhuma atração fictícia é criada.
    if (!best || best.score > 0.3) {
      const spanKm = Math.max(0.15, estimatedKm * (tripType === 'round_trip' ? 0.26 : 0.75));
      for (let i = 0; i < 8; i++) {
        const bearing = (i * Math.PI) / 4;
        const waypoint = (angle: number): Coordinates => [
          Math.max(-89.9, Math.min(89.9, origin[0] + Math.cos(angle) * spanKm / 111)),
          Math.max(-179.9, Math.min(179.9, origin[1] + Math.sin(angle) * spanKm / (111 * Math.max(0.1, Math.abs(Math.cos(origin[0] * Math.PI / 180))))))
        ];
        const path: Coordinates[] = tripType === 'round_trip'
          ? [origin, waypoint(bearing), waypoint(bearing + Math.PI / 2), origin]
          : [origin, waypoint(bearing)];
        if (alreadyShown(path)) continue;
        try {
          const road = await privateRoadRoute(db, user(res)?.id, path, mapFetch, true);
          if (!road.geometry || !road.legsSeconds || road.distanceKm < 0.03) continue;
          const drivingMinutes = Math.ceil(road.legsSeconds.reduce((sum, seconds) => sum + seconds, 0) / 60);
          const desired = mode === 'km' ? target : target * 60;
          const actual = mode === 'km' ? road.distanceKm : drivingMinutes;
          const ratio = actual / desired;
          if (ratio < 0.35 || ratio > 1.8) continue;
          const score = Math.abs(ratio - 1) + 0.14 + (oldRoute(path)?0.75:0);
          if (!best || score < best.score) best = { selected: [], score, road, totalMinutes: drivingMinutes, path };
        } catch { /* Só usa trajeto validado por provedor rodoviário. */ }
      }
    }
    if (!best) throw new ApiError(avoidWaypoints.length
      ? 'Não encontramos outra rota rodoviária diferente nesta região. Ajuste a distância ou o tipo de passeio.'
      : 'Não encontramos estradas verificadas próximas da distância/duração solicitada. Escolha outro valor ou região.', 422);

    // Persist OSM identities so the selected tourist stops survive user edits and itinerary recalculation.
    const insert = db.prepare('INSERT OR IGNORE INTO locations VALUES(?,?,?,?,?,?,?,?)');
    for (const place of best.selected) {
      insert.run(place.id, place.name, place.address, place.coords[0], place.coords[1], place.sourceUrl, place.category, new Date().toISOString());
    }
    const actual = mode === 'km' ? best.road.distanceKm : best.totalMinutes;
    const desired = mode === 'km' ? target : target * 60;
    const warnings: string[] = [];
    if (best.road.stale) warnings.push('O serviço de rotas está indisponível. Este trajeto veio do histórico da sua conta e pode estar desatualizado. Confira as condições antes de seguir.');
    if (Math.abs(actual - desired) / desired > 0.1) {
      warnings.push(`O roteiro real tem ${best.road.distanceKm.toFixed(1)} km e aproximadamente ${best.totalMinutes} minutos, diferente da sua preferência. Confira antes de iniciar.`);
    }
    if (!best.selected.length) warnings.push(discoveryUnavailable
      ? 'Não foi possível consultar atrações externas. Roteiro rodoviário verificado, sem atrações sugeridas.'
      : 'Roteiro rodoviário verificado. Não foram incluídas atrações turísticas nesta alternativa.');
    if (tripType === 'round_trip') warnings.push('O roteiro retorna ao ponto inicial. Alguns trechos podem se repetir dependendo das estradas disponíveis.');
    const destination = tripType === 'round_trip' ? origin : best.selected.at(-1)?.coords || best.road.geometry?.at(-1) || best.path.at(-1)!;
    const stops = best.selected.map((place, index) => ({
      id: `tourist-${index}-${place.id}`, name: place.name, lat: place.coords[0], lng: place.coords[1],
      category: place.category, sourceUrl: place.sourceUrl, description: place.address || 'Atração identificada no OpenStreetMap',
      recommendedMinutes: 20, type: 'suggested' as const, locationId: place.id
    }));
    res.json({
      title: best.selected.length
        ? (tripType === 'round_trip' ? `Passeio com parada em ${best.selected[0].name}` : `Passeio até ${best.selected.at(-1)!.name}`)
        : 'Rolê pela cidade — trajeto rodoviário',
      destinationName: tripType === 'round_trip' ? 'Retorno ao ponto de partida' : best.selected.at(-1)?.name || 'Destino rodoviário',
      destinationCoords: destination,
      isCircular: tripType === 'round_trip',
      distanceKm: Number(best.road.distanceKm.toFixed(2)),
      durationMinutes: best.totalMinutes,
      routePath: sampleRoutePath(best.road.geometry!, 2500),
      routeSteps: best.road.routeSteps || [],
      waypoints: best.path,
      stops, warnings, routingSource: 'OSRM', tollsStatus: 'unknown'
    });
  }));
}

import { createHash } from 'node:crypto';
import type { FuelDatabase } from './db';
import { nearbyPlaceRows, placeFromMapElement, type Coordinates, type MapFetch } from './maps';

const pending = new WeakMap<FuelDatabase, Map<string, Promise<boolean>>>();

/** Bounded and cached discovery; administrative edits always win over OSM. */
export async function discoverPlaces(db: FuelDatabase, points: Coordinates[], mapFetch: MapFetch) {
  // Use the same nearby radius as the map; route samples remain bounded upstream.
  const sampled = points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.max(1, Math.ceil(points.length / 4)) === 0);
  const key = 'places:' + createHash('sha256').update(JSON.stringify(sampled.map(p => p.map(c => Number(c.toFixed(2)))))).digest('hex');
  const cached = db.prepare('SELECT updated_at FROM map_queries WHERE id=?').get(key) as { updated_at: string } | undefined;
  let unavailable = false;
  if (!cached || Date.now() - Date.parse(cached.updated_at) > 6 * 3600000) {
    const load = async () => {
      const query = `[out:json][timeout:12];(${sampled.map(p => {
        const around = `(around:5000,${p[0]},${p[1]})`;
        return `nwr["tourism"~"^(museum|attraction|viewpoint|hotel|guest_house|hostel)$"]["name"]${around};nwr["leisure"~"^(park|nature_reserve)$"]["name"]${around};nwr["waterway"="waterfall"]["name"]${around};nwr["natural"="beach"]["name"]${around};nwr["historic"]["name"]${around};nwr["amenity"~"^(restaurant|cafe)$"]["name"]${around};nwr["shop"~"^(supermarket|mall)$"]["name"]${around};node["barrier"="toll_booth"]${around};node["highway"="toll_gantry"]${around};`;
      }).join('')});out center tags 180;`;
      try {
        const response = await mapFetch(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', {
          method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(16000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RoteiroDeViagem/1.0 (nearby-places)' }
        });
        if (!response.ok) return true;
        const data = await response.json() as any;
        if (!Array.isArray(data.elements) || data.remark) return true;
        const now = new Date().toISOString();
        const insert = db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,opening_hours,map_updated_at,kind,description,website,phone)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,
          source_url=excluded.source_url,kind=excluded.kind,map_updated_at=excluded.map_updated_at WHERE stations.managed=0`);
        for (const element of data.elements.slice(0, 180)) {
          const place = placeFromMapElement(element);
          if (!place || place.kind === 'fuel') continue;
          insert.run(place.id, place.name, place.lat, place.lng, place.address, place.sourceUrl, place.openingHours || null, now, place.kind, place.description, place.website, place.phone);
          if (place.kind === 'toll') db.prepare(`INSERT OR IGNORE INTO toll_places(id,name,lat,lng,source_url,updated_at) VALUES(?,?,?,?,?,?)`).run(place.id,place.name,place.lat,place.lng,place.sourceUrl,now);
        }
        db.prepare('INSERT OR REPLACE INTO map_queries VALUES(?,?,?)').run(key, '[]', now);
        return false;
      } catch { return true; }
    };
    // A database-local cache keeps tests/tenants isolated; no partial discoveries are cached.
    let running = pending.get(db);
    if (!running) { running = new Map(); pending.set(db, running); }
    let task = running.get(key);
    if (!task) { task = load().finally(() => running!.delete(key)); running.set(key, task); }
    unavailable = await task;
  }
  return { places: nearbyPlaceRows(db, points, 5).filter(place => place.kind !== 'fuel').slice(0, 100), mapUnavailable: unavailable };
}

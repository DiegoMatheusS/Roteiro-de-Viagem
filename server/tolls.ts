import type { Express } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import type { FuelDatabase } from './db';
import { ApiError, auth, administrator, user, now, asyncRoute, observationDate } from './http';
import { sanitizePhoto } from './photos';
import { validateCoordinates, type Coordinates, type MapFetch } from './maps';
import type { RouteToll } from '../src/types/tolls';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { sampleRoutePath } from '../src/types/itinerary';

// Distance and heading of the actual road segment near the mapped toll.
export function tollPassages(path: Coordinates[], point: Coordinates) {
  const hits: { along: number; heading: number }[] = [];
  let along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], scale = Math.cos(point[0] * Math.PI / 180);
    const ax = (a[1] - point[1]) * 111 * scale, ay = (a[0] - point[0]) * 111;
    const dx = (b[1] - a[1]) * 111 * scale, dy = (b[0] - a[0]) * 111;
    const length = Math.hypot(dx, dy), fraction = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length))) : 0;
    if (Math.hypot(ax + fraction * dx, ay + fraction * dy) <= 0.12) {
      const hit = { along: along + fraction * length, heading: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 };
      if (!hits.length || hit.along - hits[hits.length - 1].along > 1) hits.push(hit);
    }
    along += length;
  }
  return hits;
}
const headingMatches = (a: number, b: number) => Math.abs((a - b + 540) % 360 - 180) <= 60;

export function registerTollRoutes(app: Express, db: FuelDatabase, fetcher: MapFetch,
  limit: (key: string, max: number, ms: number) => void) {
  db.exec(`CREATE TABLE IF NOT EXISTS toll_places(id TEXT PRIMARY KEY,name TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,source_url TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS toll_entries(id TEXT PRIMARY KEY,toll_id TEXT NOT NULL REFERENCES toll_places(id),user_id TEXT NOT NULL REFERENCES users(id),vehicle_type TEXT NOT NULL,price REAL,heading REAL,observed_at TEXT NOT NULL,valid_until TEXT,status TEXT NOT NULL DEFAULT 'pending',image_data BLOB,notes TEXT NOT NULL DEFAULT '',reviewer_id TEXT REFERENCES users(id),created_at TEXT NOT NULL,reviewed_at TEXT);
    CREATE INDEX IF NOT EXISTS toll_entries_place ON toll_entries(toll_id,status,vehicle_type,observed_at DESC);
    CREATE INDEX IF NOT EXISTS toll_entries_queue ON toll_entries(status,created_at DESC);`);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 8 } });
  const cache = new Map<string, number>();
  const toll = (id: string) => {
    const row = db.prepare('SELECT * FROM toll_places WHERE id=?').get(id) as any;
    if (!row) throw new ApiError('Pedágio não encontrado no mapa.', 404); return row;
  };
  app.post('/api/tolls/route', asyncRoute(async (req, res) => {
    limit(`tolls:${req.ip}`, 20, 60000);
    const path = req.body.routePath;
    if (!Array.isArray(path) || path.length < 2 || path.length > 2500) throw new ApiError('Percurso inválido.');
    path.forEach((p: unknown) => validateCoordinates([p]));
    const vehicleType = req.body.vehicleType;
    if (!['car', 'motorcycle'].includes(vehicleType)) throw new ApiError('Escolha carro ou moto.');
    const points = sampleRoutePath(path, 25), key = JSON.stringify(points.map(p => p.map(n => n.toFixed(3))));
    let mapUnavailable = false;
    if (!cache.has(key) || cache.get(key)! < Date.now()) {
      try {
        // Bounded search is explicitly partial; it never proves a route toll-free.
        const query = `[out:json][timeout:20];(${points.map(p => `node["barrier"="toll_booth"](around:1500,${p[0]},${p[1]});node["highway"="toll_gantry"](around:1500,${p[0]},${p[1]});`).join('')});out tags;`;
        const response = await fetcher(process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(); const payload = await response.json() as any;
        if (!Array.isArray(payload.elements)) throw new Error();
        for (const e of payload.elements.slice(0, 500)) {
          if (e.type !== 'node' || !Number.isSafeInteger(e.id) || e.id <= 0 || !Number.isFinite(e.lat) || !Number.isFinite(e.lon) || !(e.tags?.barrier === 'toll_booth' || e.tags?.highway === 'toll_gantry')) continue;
          validateCoordinates([[e.lat, e.lon]]);
          db.prepare(`INSERT INTO toll_places VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,source_url=excluded.source_url,updated_at=excluded.updated_at`)
            .run(`osm:node:${e.id}`, String(e.tags.name || e.tags.operator || 'Pedágio identificado no mapa').slice(0, 180), e.lat, e.lon, `https://www.openstreetmap.org/node/${e.id}`, now());
        }
        if (cache.size > 1000) cache.clear(); cache.set(key, Date.now() + 6 * 3600000);
      } catch { mapUnavailable = true; }
    }
    const latitude = path.map((p: Coordinates) => p[0]), longitude = path.map((p: Coordinates) => p[1]);
    const candidates = db.prepare('SELECT * FROM toll_places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY id')
      .all(Math.min(...latitude)-0.01,Math.max(...latitude)+0.01,Math.min(...longitude)-0.02,Math.max(...longitude)+0.02) as any[];
    const groups: { place: any; ids: string[]; passages: ReturnType<typeof tollPassages> }[] = [];
    for (const row of candidates) {
      const passages = tollPassages(path,[row.lat,row.lng]); if (!passages.length) continue;
      const group = groups.find(g => distanceBetweenKm([g.place.lat,g.place.lng],[row.lat,row.lng]) < 0.2 && Math.abs(g.passages[0].along-passages[0].along) < 0.3);
      if (group) group.ids.push(row.id); else groups.push({ place:row,ids:[row.id],passages });
    }
    const routeTolls: RouteToll[] = [];
    let knownCost = 0;
    for (const { place:row,ids,passages } of groups) {
      // Preserve valid contributions made against any lane node in the same plaza.
      const entries = db.prepare(`SELECT id,price,heading,observed_at,valid_until FROM toll_entries WHERE toll_id IN (${ids.map(() => '?').join(',')}) AND vehicle_type=? AND status='approved' AND valid_until>? ORDER BY observed_at DESC,reviewed_at DESC,id DESC`)
        .all(...ids,vehicleType,now()) as any[];
      const used = passages.map(p => entries.find(e => e.heading == null || headingMatches(p.heading,e.heading)));
      const selected = used.find(Boolean), missingPassages = used.filter(e => !e).length;
      const subtotal = Number(used.reduce((sum,e) => sum+(e?.price ?? 0),0).toFixed(2));
      knownCost += subtotal;
      routeTolls.push({ id:row.id,name:row.name,coords:[row.lat,row.lng],sourceUrl:row.source_url,passages:passages.length,
        knownCost:subtotal,missingPassages,
        price:missingPassages === 0 && used.every(e => e.price === selected.price) ? selected.price : null,
        priceId:selected?.id,observedAt:selected?.observed_at,validUntil:selected?.valid_until,headingDegrees:selected?.heading,
        tariffs:used.map((e,index) => ({ price:e?.price ?? null,headingDegrees:passages[index].heading,priceId:e?.id,observedAt:e?.observed_at,validUntil:e?.valid_until })) });
    }
    res.json({ tolls: routeTolls, knownCost: Number(knownCost.toFixed(2)), status: routeTolls.some(t => t.tariffs?.some(p => p.price !== null)) ? 'partial' : 'unknown', updatedAt: now(), mapUnavailable,
      warning: 'Soma das tarifas aprovadas nos pedágios identificados. A cobertura do mapa é parcial; outras cobranças podem existir.' });
  }));
  app.post('/api/tolls/:id/contributions', auth, upload.single('photo'), asyncRoute(async (req, res) => {
    const place = toll(String(req.params.id)), owner = user(res).id;
    if ((db.prepare('SELECT COUNT(*) AS count FROM toll_entries WHERE user_id=? AND created_at>?').get(owner,new Date(Date.now()-86400000).toISOString()) as any).count >= 10) throw new ApiError('Limite diário de contribuições atingido.',429);
    limit(`toll-send:${owner}`, 10, 86400000); limit(`toll-photo:${req.ip}`, 3, 10 * 60000);
    const vehicleType = req.body.vehicleType, price = req.body.price === '' || req.body.price == null ? null : Number(req.body.price);
    const heading = req.body.headingDegrees === '' || req.body.headingDegrees == null ? null : Number(req.body.headingDegrees);
    if (!['car', 'motorcycle'].includes(vehicleType) || (price !== null && (!Number.isFinite(price) || price < 0 || price > 2000 || Math.abs(price*100-Math.round(price*100)) > 0.000001)) ||
      (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) || req.body.confirmed !== 'true' && req.body.confirmed !== true)
      throw new ApiError('Confirme o pedágio, a categoria e um valor válido.');
    if (price === null && !req.file) throw new ApiError('Informe o valor ou envie uma foto da tarifa.');
    const observedAt = observationDate(req.body.observedAt);
    const image = req.file ? await sanitizePhoto(req.file.buffer) : null;
    if (image && image.length > 1024 * 1024) throw new ApiError('Imagem muito grande após processamento.', 413);
    const id = randomUUID();
    db.prepare('INSERT INTO toll_entries(id,toll_id,user_id,vehicle_type,price,heading,observed_at,image_data,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, place.id, owner, vehicleType, price, heading, observedAt, image, String(req.body.notes || '').slice(0, 1000), now());
    res.status(201).json({ id, status: 'pending', message: 'Tarifa enviada para análise do administrador.' });
  }));
  app.get('/api/tolls/:id/contributions', auth, (req, res) => {
    const place = toll(String(req.params.id));
    const ids = (db.prepare('SELECT id,lat,lng FROM toll_places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?').all(place.lat-0.003,place.lat+0.003,place.lng-0.005,place.lng+0.005) as any[]).filter(p => distanceBetweenKm([p.lat,p.lng],[place.lat,place.lng]) < 0.2).map(p => p.id);
    res.json({ entries: db.prepare(`SELECT id,vehicle_type,price,observed_at,status,notes,reviewed_at FROM toll_entries WHERE toll_id IN (${ids.map(() => '?').join(',')}) AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50`).all(...ids,user(res).id) });
  });
  app.get('/api/admin/tolls', auth, administrator, (req, res) => {
    const page = Math.max(0, Math.min(10000, Number(req.query.page) || 0));
    res.json({ entries: db.prepare("SELECT e.id,e.toll_id,e.vehicle_type,e.price,e.heading,e.observed_at,e.notes,e.status,e.created_at,e.image_data IS NOT NULL AS has_photo,t.name,t.source_url,u.display_name FROM toll_entries e JOIN toll_places t ON t.id=e.toll_id JOIN users u ON u.id=e.user_id WHERE e.status='pending' ORDER BY e.created_at DESC LIMIT 20 OFFSET ?").all(page * 20) });
  });
  app.get('/api/admin/tolls/:id/photo', auth, administrator, (req, res) => {
    const row = db.prepare('SELECT image_data FROM toll_entries WHERE id=?').get(String(req.params.id)) as any;
    if (!row?.image_data) throw new ApiError('Foto não encontrada.', 404); res.type('jpeg').send(Buffer.from(row.image_data));
  });
  app.post('/api/admin/tolls/:id/review', auth, administrator, (req, res) => {
    const id = String(req.params.id), entry = db.prepare("SELECT * FROM toll_entries WHERE id=? AND status='pending'").get(id) as any;
    if (!entry) throw new ApiError('Contribuição não encontrada ou já revisada.', 404);
    const approve = req.body.action === 'approve', reject = req.body.action === 'reject';
    const price = req.body.price == null || req.body.price === '' ? null : Number(req.body.price);
    const heading = req.body.headingDegrees == null || req.body.headingDegrees === '' ? null : Number(req.body.headingDegrees);
    if (!approve && !reject || approve && (price === null || !Number.isFinite(price) || price < 0 || price > 2000 || Math.abs(price*100-Math.round(price*100)) > 0.000001) || heading !== null && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) throw new ApiError('Informe ação, tarifa e sentido válidos.');
    const notes = String(req.body.notes || '').trim().slice(0, 1000);
    if (reject && notes.length < 3) throw new ApiError('Informe o motivo da rejeição.');
    const observedAt = req.body.observedAt ? observationDate(req.body.observedAt) : entry.observed_at;
    const validUntil = new Date(new Date(observedAt).getTime() + 90 * 86400000).toISOString();
    if (approve && validUntil <= now()) throw new ApiError('A evidência venceu; solicite uma informação atual.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE toll_entries SET status=?,price=?,heading=?,observed_at=?,valid_until=?,notes=?,reviewer_id=?,reviewed_at=? WHERE id=? AND status=\'pending\'')
        .run(approve ? 'approved' : 'rejected', price, heading, observedAt, validUntil, notes, user(res).id, now(), id);
      db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user(res).id, 'tolls', id, req.body.action, notes, now());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ ok: true });
  });
}

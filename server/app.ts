import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { FuelDatabase } from './db';
import type { FuelUser, FuelComparison } from '../src/types/fuel';
import { validatePriceDraft } from '../src/services/fuelPriceRules';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { compareStationCost } from '../src/services/fuelComparison';
import { discoverStations, roadRoute, validateCoordinates, type MapFetch } from './maps';
import { stationDetails } from './prices';
import { sanitizePhoto } from './photos';
import { registerAdminRoutes } from './admin';
import { registerItineraryRoutes } from './itinerary';
import { registerTouristRoutes } from './tourist';
import { registerSharingRoutes } from './sharing';
import { ApiError, asyncRoute, auth, administrator, user, now, validate, observationDate } from './http';
import { stationOpeningStatus } from './openingHours';

const scryptAsync = promisify(scrypt);
export function createApi(options: { db: FuelDatabase; photoDirectory?: string; mapFetch?: MapFetch }) {
  const { db } = options;
  const photosDir = path.resolve(options.photoDirectory || process.env.PHOTO_DIRECTORY || './data/photos');
  fs.mkdirSync(photosDir, { recursive: true, mode: 0o700 });
  // Preserve any earlier local photo records while moving image content into the database.
  for (const photo of db.prepare('SELECT id,filename FROM photos WHERE image_data IS NULL').all() as any[]) {
    if (/^[a-f0-9-]+\.jpg$/.test(photo.filename) && fs.existsSync(path.join(photosDir, photo.filename))) {
      db.prepare('UPDATE photos SET image_data=? WHERE id=?').run(fs.readFileSync(path.join(photosDir, photo.filename)), photo.id);
      fs.rmSync(path.join(photosDir, photo.filename));
    }
  }
  for (const filename of fs.readdirSync(photosDir)) {
    if (!/^[a-f0-9-]+\.jpg$/.test(filename)) continue;
    const saved = db.prepare('SELECT length(image_data) AS bytes FROM photos WHERE filename=?').get(filename) as any;
    if (saved?.bytes) fs.rmSync(path.join(photosDir, filename));
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '80kb' }));
  const attempts = new Map<string, { count: number; reset: number }>();
  const limit = (key: string, max: number, windowMs: number) => {
    if (attempts.size > 10000) for (const [id, entry] of attempts) if (entry.reset < Date.now()) attempts.delete(id);
    const current = attempts.get(key);
    if (!current || current.reset <= Date.now()) { attempts.set(key, { count: 1, reset: Date.now() + windowMs }); return; }
    if (++current.count > max) throw new ApiError('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
  };
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      limit(`requests:${req.ip}`, 180, 60000);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
        const allowed = new Set([process.env.PUBLIC_APP_URL || 'http://localhost:3000', ...(process.env.NODE_ENV !== 'production' ? ['http://127.0.0.1:3000'] : [])]);
        if (!allowed.has(req.headers.origin)) throw new ApiError('Origem da solicitação não permitida.', 403);
      }
      const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('rdv_session='))?.slice(12);
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        const row = db.prepare(`SELECT u.id,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.blocked_at IS NULL AND u.deleted_at IS NULL`).get(createHash('sha256').update(token).digest('hex'), now()) as any;
        if (row) res.locals.user = { id: row.id, displayName: row.display_name, role: row.role };
      }
      next();
    } catch (error) { next(error); }
  });
  const setSession = (res: Response, account: any) => {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), account.id, new Date(Date.now() + 7 * 86400000).toISOString());
    res.cookie('rdv_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api', maxAge: 7 * 86400000 });
    return { id: account.id, displayName: account.display_name, role: account.role };
  };
  const station = (id: string) => {
    if (!db.prepare("SELECT id FROM stations WHERE id=? AND active=1 AND kind='fuel'").get(id)) throw new ApiError('Posto não encontrado na base de mapas.', 404);
  };

  registerAdminRoutes(app, { db, mapFetch: options.mapFetch, limit });
  registerItineraryRoutes(app, { db, mapFetch: options.mapFetch, limit });
  registerTouristRoutes(app, { db, mapFetch: options.mapFetch, limit });
  registerSharingRoutes(app, db, limit);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/auth/me', (_req, res) => res.json({ user: user(res) || null }));
  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    limit(`register:${req.ip}`, 5, 3600000);
    const email = String(req.body.email || '').trim().toLowerCase();
    const displayName = String(req.body.displayName || '').trim();
    const password = req.body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180 || displayName.length < 2 || displayName.length > 50 || typeof password !== 'string' || password.length < 10 || password.length > 128) throw new ApiError('Informe nome, e-mail válido e senha com 10 a 128 caracteres.');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw new ApiError('Este e-mail já possui uma conta.', 409);
    const salt = randomBytes(16).toString('hex');
    const hash = (await scryptAsync(password, salt, 64) as Buffer).toString('hex');
    const account = { id: randomUUID(), display_name: displayName, role: 'user' };
    try { db.prepare('INSERT INTO users(id,email,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(account.id, email, displayName, `${salt}:${hash}`, 'user', now()); }
    catch { throw new ApiError('Este e-mail já possui uma conta.', 409); }
    res.status(201).json({ user: setSession(res, account) });
  }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    limit(`login:${req.ip}`, 10, 15 * 60000);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    if (typeof password !== 'string' || password.length > 128 || email.length > 180) throw new ApiError('E-mail ou senha incorretos.', 401);
    const account = db.prepare('SELECT * FROM users WHERE email=? AND blocked_at IS NULL AND deleted_at IS NULL').get(email) as any;
    const [salt, expected] = (account?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await scryptAsync(password, salt, 64) as Buffer;
    if (!account || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new ApiError('E-mail ou senha incorretos.', 401);
    res.json({ user: setSession(res, account) });
  }));
  app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('rdv_session='))?.slice(12);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(createHash('sha256').update(token).digest('hex'));
    res.clearCookie('rdv_session', { path: '/api', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  });

  app.post('/api/stations/search', asyncRoute(async (req, res) => {
    limit(`maps:${req.ip}`, 15, 60000);
    const points = validate(() => validateCoordinates(req.body.points));
    const radius = req.body.radiusKm ?? 5;
    if (!Number.isFinite(radius) || radius < 1 || radius > 10) throw new ApiError('Use um raio entre 1 e 10 km.');
    let discovery;
    try { discovery = await discoverStations(db, points, radius, options.mapFetch); }
    catch (error) { throw new ApiError((error as Error).message, 503); }
    res.json({ ...discovery, stations: discovery.stationIds.map(id => stationDetails(db, id, user(res)?.id)).filter(Boolean) });
  }));
  app.get('/api/stations/:id', (req, res) => {
    const details = stationDetails(db, req.params.id, user(res)?.id);
    if (!details) throw new ApiError('Posto não encontrado.', 404);
    res.json(details);
  });
  app.get('/api/stations/:id/my-photos', auth, (req, res) => {
    station(req.params.id);
    res.json(db.prepare("SELECT ph.id,ph.status,ph.created_at,(SELECT notes FROM moderation_actions WHERE target_type='photos' AND target_id=ph.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AS reviewNote FROM photos ph WHERE station_id=? AND user_id=? ORDER BY created_at DESC,ph.rowid DESC LIMIT 20").all(req.params.id, user(res).id));
  });
  app.post('/api/stations/:id/prices', auth, (req, res) => {
    const stationId = req.params.id;
    station(stationId);
    limit(`prices:${user(res).id}`, 10, 60000);
    if (!Array.isArray(req.body.prices) || req.body.prices.length < 1 || req.body.prices.length > 8 || req.body.confirmed !== true) throw new ApiError('Confira os valores e confirme o envio para análise.');
    const prices = req.body.prices.map((price: unknown) => validate(() => validatePriceDraft(price)));
    if (new Set(prices.map((p: any) => `${p.fuelType}:${p.customLabel || ''}`)).size !== prices.length) throw new ApiError('Informe cada combustível apenas uma vez.');
    const observedAt = observationDate(req.body.observedAt);
    const daily = db.prepare('SELECT COUNT(*) AS count FROM prices WHERE user_id=? AND created_at>?').get(user(res).id, new Date(Date.now() - 86400000).toISOString()) as any;
    if (daily.count + prices.length > 20) throw new ApiError('Limite diário de contribuições atingido. Tente amanhã.', 429);
    const photoId = req.body.photoId || null;
    if (photoId) {
      if (typeof photoId !== 'string' || photoId.length > 40) throw new ApiError('Foto inválida.');
      const photo = db.prepare('SELECT id,user_id,station_id,status FROM photos WHERE id=?').get(photoId) as any;
      if (!photo || photo.user_id !== user(res).id || photo.station_id !== stationId || !['pending', 'approved'].includes(photo.status)) throw new ApiError('A foto não está disponível para esta contribuição.');
    }
    const entries = prices.map((price: any) => {
      const recent = db.prepare('SELECT id FROM prices WHERE station_id=? AND user_id=? AND fuel_type=? AND created_at>?').get(stationId, user(res).id, price.fuelType, new Date(Date.now() - 10 * 60000).toISOString());
      if (recent) throw new ApiError('Você já informou este combustível neste posto. Aguarde 10 minutos.', 429);
      return { ...price, id: randomUUID(), status: 'pending_review' };
    });
    db.exec('BEGIN');
    try {
      const insert = db.prepare('INSERT INTO prices(id,station_id,user_id,fuel_type,custom_label,price,observed_at,created_at,source,photo_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
      entries.forEach((price: any) => insert.run(price.id, stationId, user(res).id, price.fuelType, price.customLabel || null, price.price, observedAt, now(), photoId ? 'photo' : 'manual', photoId, price.status));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.status(201).json({ entries: entries.map((p: any) => ({ id: p.id, status: p.status })), station: stationDetails(db, stationId, user(res).id) });
  });
  app.post('/api/prices/:id/vote', auth, (req, res) => {
    limit(`votes:${user(res).id}`, 30, 3600000);
    const price = db.prepare('SELECT * FROM prices WHERE id=? AND status=?').get(req.params.id, 'published') as any;
    if (!price) throw new ApiError('Preço não disponível.', 404);
    if (price.user_id === user(res).id) throw new ApiError('Outros viajantes devem confirmar sua contribuição.');
    if (!['confirm', 'contest'].includes(req.body.vote)) throw new ApiError('Escolha confirmar ou contestar.');
    db.prepare('INSERT INTO votes VALUES(?,?,?,?) ON CONFLICT(price_id,user_id) DO UPDATE SET vote=excluded.vote,created_at=excluded.created_at').run(price.id, user(res).id, req.body.vote, now());
    res.json(stationDetails(db, price.station_id, user(res).id));
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3 } });
  app.post('/api/stations/:id/photos', auth, (req, res, next) => {
    try { station(req.params.id); limit(`upload:${user(res).id}`, 3, 10 * 60000); next(); } catch (error) { next(error); }
  }, upload.single('photo'), asyncRoute(async (req, res) => {
    if (!req.file) throw new ApiError('Envie uma foto da placa do posto.');
    if (req.body.confirmedStation !== 'true') throw new ApiError('Confirme que a foto corresponde ao posto selecionado.');
    const observedAt = observationDate(req.body.observedAt);
    db.prepare('DELETE FROM photo_uploads WHERE created_at<?').run(new Date(Date.now() - 7 * 86400000).toISOString());
    const daily = db.prepare('SELECT COUNT(*) AS count FROM photo_uploads WHERE user_id=? AND created_at>?').get(user(res).id, new Date(Date.now() - 86400000).toISOString()) as any;
    if (daily.count >= 10) throw new ApiError('Limite diário de fotos atingido.', 429);
    let cleaned: Buffer;
    try { cleaned = await sanitizePhoto(req.file.buffer); } catch { throw new ApiError('Foto inválida. Envie um JPG, PNG ou WEBP de até 24 megapixels.'); }
    if (cleaned.length > 1024 * 1024) throw new ApiError('A foto ainda está muito grande após a compressão. Escolha uma imagem menor.');
    const hash = createHash('sha256').update(cleaned).digest('hex');
    if (db.prepare('SELECT id FROM photos WHERE user_id=? AND station_id=? AND content_hash=? AND created_at>?').get(user(res).id, req.params.id, hash, new Date(Date.now() - 10 * 60000).toISOString())) throw new ApiError('Esta foto já foi enviada para este posto. Aguarde a revisão.', 429);
    const id = randomUUID();
    const filename = `${id}.jpg`;
    db.exec('BEGIN');
    try {
      const used = db.prepare('SELECT COUNT(*) AS count FROM photo_uploads WHERE user_id=? AND created_at>?').get(user(res).id, new Date(Date.now() - 86400000).toISOString()) as any;
      if (used.count >= 10) throw new ApiError('Limite diário de fotos atingido.', 429);
      db.prepare('INSERT INTO photos(id,station_id,user_id,filename,status,created_at,image_data,observed_at,content_hash) VALUES(?,?,?,?,?,?,?,?,?)').run(id, req.params.id, user(res).id, filename, 'pending', now(), cleaned, observedAt, hash);
      db.prepare('INSERT INTO photo_uploads VALUES(?,?,?)').run(id, user(res).id, now());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.status(201).json({ photoId: id, status: 'pending', message: 'Foto enviada para análise' });
  }));
  app.get('/api/photos/:id', (req, res) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id) as any;
    const isPublic = photo?.status === 'approved' && db.prepare("SELECT p.id FROM prices p JOIN stations s ON s.id=p.station_id WHERE p.photo_id=? AND p.status='published' AND s.active=1 LIMIT 1").get(photo.id);
    if (!photo || !isPublic && photo.user_id !== user(res)?.id && user(res)?.role !== 'admin') throw new ApiError('Foto não disponível.', 404);
    if (!photo.image_data) throw new ApiError('Foto não disponível.', 404);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(Buffer.from(photo.image_data));
  });
  app.delete('/api/photos/:id', auth, (req, res) => {
    const photo = db.prepare('SELECT * FROM photos WHERE id=?').get(req.params.id) as any;
    if (!photo || photo.user_id !== user(res).id && user(res).role !== 'admin') throw new ApiError('Foto não encontrada.', 404);
    db.prepare('DELETE FROM photos WHERE id=?').run(photo.id);
    fs.rmSync(path.join(photosDir, photo.filename), { force: true });
    res.json({ ok: true });
  });
  app.post('/api/:targetType(prices|photos)/:id/report', auth, (req, res) => {
    limit(`reports:${user(res).id}`, 10, 3600000);
    const table = req.params.targetType;
    const target = db.prepare(`SELECT * FROM ${table === 'prices' ? 'prices' : 'photos'} WHERE id=?`).get(req.params.id) as any;
    if (!target || table === 'photos' && target.status !== 'approved' && target.user_id !== user(res).id) throw new ApiError('Contribuição não encontrada.', 404);
    const reason = String(req.body.reason || '');
    const details = String(req.body.details || '').trim();
    if (!['preco_incorreto', 'spam', 'dados_pessoais', 'imagem_inadequada', 'outro'].includes(reason) || details.length > 300) throw new ApiError('Escolha um motivo válido e descreva em até 300 caracteres.');
    if (db.prepare('SELECT id FROM reports WHERE target_type=? AND target_id=? AND user_id=?').get(table, target.id, user(res).id)) throw new ApiError('Você já denunciou esta contribuição.', 409);
    db.prepare('INSERT INTO reports VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), table, target.id, user(res).id, reason, details, 'open', now());
    if (table === 'photos') db.prepare('UPDATE photos SET status=? WHERE id=?').run('pending', target.id);
    res.status(201).json({ ok: true });
  });

  app.post('/api/admin/stations/:id/hours', auth, administrator, (req, res) => {
    station(req.params.id);
    const hours = String(req.body.openingHours || '').trim();
    if (!hours || hours.length > 200 || req.body.confirmed !== true) throw new ApiError('Confira e confirme o horário de funcionamento.');
    db.prepare('UPDATE stations SET opening_hours=?,hours_verified_at=? WHERE id=?').run(hours, now(), req.params.id);
    db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)').run(randomUUID(), user(res).id, 'stations', req.params.id, 'verify_hours', hours, now());
    res.json(stationDetails(db, req.params.id));
  });

  app.post('/api/fuel/compare', asyncRoute(async (req, res) => {
    limit(`compare:${req.ip}`, 6, 60000);
    const points = validate(() => validateCoordinates(req.body.routePath));
    if (points.length < 2) throw new ApiError('Planeje uma rota antes de comparar postos.');
    const { consumptionKmPerLiter, remainingFuelLiters, litersToBuy, tankCapacityLiters, fuelType } = req.body;
    if (![consumptionKmPerLiter, remainingFuelLiters, litersToBuy, tankCapacityLiters].every(Number.isFinite) || consumptionKmPerLiter < 1 || consumptionKmPerLiter > 100 || remainingFuelLiters < 0 || tankCapacityLiters <= 0 || tankCapacityLiters > 200 || remainingFuelLiters > tankCapacityLiters || litersToBuy <= 0 || litersToBuy > tankCapacityLiters - remainingFuelLiters || !['gasolina_comum', 'gasolina_aditivada', 'etanol', 'diesel_comum', 'diesel_s10'].includes(fuelType)) throw new ApiError('Confira combustível, consumo, autonomia e capacidade do tanque.');
    let discovery;
    try { discovery = await discoverStations(db, points, 5, options.mapFetch); }
    catch (error) { throw new ApiError((error as Error).message, 503); }
    const stations = discovery.stationIds.map(id => stationDetails(db, id, user(res)?.id)!).filter(Boolean);
    const candidates = stations.map(station => ({ station, price: station.prices.find(p => p.fuelType === fuelType && !p.stale && !p.disputed) })).filter(item => item.price);
    if (!candidates.length) { res.json({ results: [], stationsWithNoFreshPrice: stations.length, routingUnavailable: 0, estimatedRangeKm: remainingFuelLiters * consumptionKmPerLiter, source: 'OpenStreetMap / OSRM' }); return; }
    const departureAt = req.body.departureAt ? new Date(req.body.departureAt) : new Date();
    if (!Number.isFinite(departureAt.getTime()) || Math.abs(departureAt.getTime() - Date.now()) > 30 * 86400000) throw new ApiError('Informe uma saída válida, em até 30 dias.');
    let baseline;
    try { baseline = await roadRoute(points, options.mapFetch); }
    catch { throw new ApiError('Não foi possível calcular os desvios por estrada. Tente novamente mais tarde.', 503); }
    const results: FuelComparison[] = [];
    let routingUnavailable = 0;
    // Bound public routing requests, and disclose stations that could not be compared.
    const selected = candidates.sort((a, b) => a.price!.price - b.price!.price).slice(0, 8);
    for (const candidate of selected) {
      let closest = 0;
      let minimum = Infinity;
      for (let index = 0; index < points.length - 1; index++) {
        const distance = distanceBetweenKm(points[index], [candidate.station.lat, candidate.station.lng]) + distanceBetweenKm(points[index + 1], [candidate.station.lat, candidate.station.lng]);
        if (distance < minimum) { closest = index; minimum = distance; }
      }
      const viaPoints = [...points.slice(0, closest + 1), [candidate.station.lat, candidate.station.lng] as [number, number], ...points.slice(closest + 1)];
      try {
        const via = await roadRoute(viaPoints, options.mapFetch);
        const distanceToStationKm = via.legsKm.slice(0, closest + 1).reduce((sum, km) => sum + km, 0);
        const arrivalAt = via.legsSeconds ? new Date(departureAt.getTime() + via.legsSeconds.slice(0, closest + 1).reduce((sum, seconds) => sum + seconds, 0) * 1000) : undefined;
        results.push({ ...compareStationCost(candidate.station, candidate.price!, { consumptionKmPerLiter, remainingFuelLiters, litersToBuy, baselineKm: baseline.distanceKm, viaStationKm: via.distanceKm, distanceToStationKm }), openingStatus: stationOpeningStatus(candidate.station, arrivalAt), estimatedArrivalAt: arrivalAt?.toISOString() });
      } catch { routingUnavailable++; }
    }
    results.sort((a, b) => Number(b.reachable && b.openingStatus !== 'closed') - Number(a.reachable && a.openingStatus !== 'closed') || a.totalCost - b.totalCost);
    res.json({ results, stationsWithNoFreshPrice: stations.length - candidates.length, routingUnavailable,
      comparedStations: selected.length, additionalCandidates: Math.max(0, candidates.length - selected.length),
      estimatedRangeKm: remainingFuelLiters * consumptionKmPerLiter, baselineDistanceKm: baseline.distanceKm, source: 'OpenStreetMap / OSRM' });
  }));

  app.use('/api', (_req, _res, next) => next(new ApiError('Recurso não encontrado.', 404)));
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    const expected = error instanceof ApiError;
    const status = expected ? error.status : error instanceof multer.MulterError ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: expected ? error.message : error instanceof multer.MulterError ? 'Envie uma foto de até 8 MB.' : status === 400 ? 'Solicitação inválida.' : 'Não foi possível concluir esta ação. Tente novamente.' });
  });
  return app;
}

import type { Express, Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { FuelDatabase } from './db';
import { ApiError, auth, administrator, asyncRoute, now, user, validate, observationDate } from './http';
import { lookupMapPlace, validateCoordinates, nearbyPlaceRows, type MapFetch } from './maps';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { validatePriceDraft } from '../src/services/fuelPriceRules';
import type { Place, PriceHistory } from '../src/types/admin';

const pageArgs = (req: Request) => {
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ApiError('Página inválida.');
  return { page, size: 20, offset: (page - 1) * 20 };
};
const text = (value: unknown, max: number, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) throw new ApiError(`Informe um texto válido de até ${max} caracteres.`);
  return value.trim();
};
const placeDto = (row: any): Place => ({ id: row.id, name: row.name, kind: row.kind, lat: row.lat, lng: row.lng, address: row.address,
  sourceUrl: row.source_url, description: row.description, website: row.website, phone: row.phone, active: Boolean(row.active), openingHours: row.opening_hours || undefined });
export function priceHistory(db: FuelDatabase, stationId: string): PriceHistory[] {
  return (db.prepare(`SELECT p.id,p.fuel_type,p.custom_label,p.price,p.observed_at,p.approved_at,p.status,u.display_name AS contributor,a.display_name AS reviewer
    FROM prices p JOIN users u ON u.id=p.user_id LEFT JOIN users a ON a.id=p.approved_by WHERE p.station_id=? ORDER BY p.created_at DESC,p.rowid DESC LIMIT 30`).all(stationId) as any[])
    .map(row => ({ id: row.id, fuelType: row.fuel_type, customLabel: row.custom_label || undefined, price: row.price, observedAt: row.observed_at, publishedAt: row.approved_at || undefined, status: row.status, contributor: row.contributor, reviewer: row.reviewer || undefined }));
}

export function registerAdminRoutes(app: Express, options: { db: FuelDatabase; mapFetch?: MapFetch; limit: (key: string, max: number, windowMs: number) => void }) {
  const { db, limit } = options;
  const audit = (actor: string, type: string, id: string, action: string, notes = '') =>
    db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)').run(randomUUID(), actor, type, id, action, notes, now());
  const transaction = (fn: () => void) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const activePlace = (id: string, fuelOnly = false) => {
    const row = db.prepare('SELECT * FROM stations WHERE id=? AND active=1').get(id) as any;
    if (!row || fuelOnly && row.kind !== 'fuel') throw new ApiError('Estabelecimento não encontrado.', 404);
    return row;
  };
  const pageResult = (req: Request, select: string, count: string, params: any[] = []) => {
    const { page, size, offset } = pageArgs(req);
    return { items: db.prepare(`${select} LIMIT ? OFFSET ?`).all(...params, size, offset), total: (db.prepare(count).get(...params) as any).count, page, pageSize: size };
  };

  app.post('/api/places/search', (req, res) => {
    const points = validate(() => validateCoordinates(req.body.points));
    const places = nearbyPlaceRows(db, points, 5).filter(place => place.kind !== 'fuel').slice(0, 100).map(placeDto);
    res.json({ places });
  });
  app.get('/api/places/:id', (req, res) => res.json(placeDto(activePlace(req.params.id))));
  app.get('/api/places/:id/comments', (req, res) => {
    activePlace(req.params.id);
    const params = [req.params.id, user(res)?.id || ''];
    res.json(pageResult(req, `SELECT c.id,c.body,c.status,c.created_at AS createdAt,u.display_name AS displayName FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.place_id=? AND (c.status='published' OR (c.user_id=? AND c.status='pending')) ORDER BY c.created_at DESC,c.rowid DESC`,
      "SELECT COUNT(*) AS count FROM comments WHERE place_id=? AND (status='published' OR (user_id=? AND status='pending'))", params));
  });
  app.post('/api/places/:id/comments', auth, (req, res) => {
    activePlace(req.params.id); limit(`comments:${user(res).id}`, 3, 10 * 60000);
    const body = text(req.body.body, 1000, true);
    const daily = db.prepare('SELECT COUNT(*) AS count FROM comments WHERE user_id=? AND created_at>?').get(user(res).id, new Date(Date.now() - 86400000).toISOString()) as any;
    if (daily.count >= 10) throw new ApiError('Limite diário de comentários atingido.', 429);
    db.prepare('INSERT INTO comments VALUES(?,?,?,?,?,?)').run(randomUUID(), req.params.id, user(res).id, body, 'pending', now());
    res.status(201).json({ message: 'Comentário enviado para análise.' });
  });
  app.post('/api/comments/:id/report', auth, (req, res) => {
    limit(`reports:${user(res).id}`, 10, 3600000);
    const row = db.prepare("SELECT c.id FROM comments c JOIN stations s ON s.id=c.place_id WHERE c.id=? AND c.status='published' AND s.active=1").get(req.params.id);
    if (!row) throw new ApiError('Comentário não encontrado.', 404);
    const details = text(req.body.details || '', 300);
    db.prepare("INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), 'comments', req.params.id, user(res).id, 'outro', details, 'open', now());
    res.status(201).json({ message: 'Denúncia enviada para análise.' });
  });

  // UI visibility never substitutes for authorization on every administrative request.
  app.use('/api/admin', auth, administrator);
  app.get('/api/admin/summary', (_req, res) => {
    const count = (sql: string) => (db.prepare(sql).get() as any).count;
    res.json({ tolls: count("SELECT COUNT(*) AS count FROM toll_entries WHERE status='pending'"), photos: count("SELECT COUNT(*) AS count FROM photos ph JOIN stations s ON s.id=ph.station_id WHERE ph.status='pending' AND s.active=1"),
      prices: count("SELECT COUNT(*) AS count FROM prices p JOIN stations s ON s.id=p.station_id WHERE p.status='pending_review' AND s.active=1"), places: count('SELECT COUNT(*) AS count FROM stations WHERE active=1'), users: count('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'),
      comments: count("SELECT COUNT(*) AS count FROM comments WHERE status='pending'"), reports: count("SELECT COUNT(*) AS count FROM reports WHERE status='open'") });
  });
  app.get('/api/admin/photos', (req, res) => {
    const result = pageResult(req, `SELECT ph.id,ph.station_id AS stationId,ph.status,ph.created_at AS createdAt,ph.observed_at AS observedAt,s.name AS stationName,s.address,u.display_name AS contributor
      FROM photos ph JOIN stations s ON s.id=ph.station_id JOIN users u ON u.id=ph.user_id WHERE ph.status='pending' AND s.active=1 ORDER BY ph.created_at DESC,ph.rowid DESC`,
      "SELECT COUNT(*) AS count FROM photos ph JOIN stations s ON s.id=ph.station_id WHERE ph.status='pending' AND s.active=1");
    result.items = (result.items as any[]).map(photo => ({ ...photo, history: priceHistory(db, photo.stationId) }));
    res.json(result);
  });
  app.get('/api/admin/prices', (req, res) => res.json(pageResult(req,
    `SELECT p.id,p.station_id AS stationId,s.name AS stationName,s.address,p.fuel_type AS fuelType,p.custom_label AS customLabel,p.price,p.observed_at AS observedAt,p.photo_id AS photoId,p.status,u.display_name AS contributor
    FROM prices p JOIN stations s ON s.id=p.station_id JOIN users u ON u.id=p.user_id WHERE p.status='pending_review' AND s.active=1 ORDER BY p.created_at DESC,p.rowid DESC`,
    "SELECT COUNT(*) AS count FROM prices p JOIN stations s ON s.id=p.station_id WHERE p.status='pending_review' AND s.active=1")));
  app.get('/api/admin/places', (req, res) => {
    const q = text(String(req.query.q || ''), 100);
    const kind = String(req.query.kind || '');
    const params = [`%${q}%`, `%${q}%`, kind, kind];
    const where = 'WHERE (name LIKE ? OR address LIKE ?) AND (?=\'\' OR kind=?)';
    const result = pageResult(req, `SELECT * FROM stations ${where} ORDER BY active DESC,name,id`, `SELECT COUNT(*) AS count FROM stations ${where}`, params);
    result.items = result.items.map(placeDto) as any;
    res.json(result);
  });
  app.post('/api/admin/places', asyncRoute(async (req, res) => {
    limit(`imports:${user(res).id}`, 10, 60000);
    const reference = text(req.body.reference, 300, true);
    let place: Place;
    try { place = await lookupMapPlace(reference, options.mapFetch); } catch (error) { throw new ApiError((error as Error).message, 422); }
    const existing = db.prepare('SELECT id FROM stations WHERE id=?').get(place.id);
    if (existing) throw new ApiError('Este estabelecimento já está cadastrado. Use a busca para editar ou reativar.', 409);
    transaction(() => {
      db.prepare(`INSERT INTO stations(id,name,lat,lng,address,source_url,opening_hours,map_updated_at,kind,active,managed,description,website,phone)
        VALUES(?,?,?,?,?,?,?,?,?,1,1,?,?,?)`).run(place.id, place.name, place.lat, place.lng, place.address, place.sourceUrl, place.openingHours || null, now(), place.kind, '', place.website, place.phone);
      audit(user(res).id, 'places', place.id, 'create');
    });
    res.status(201).json(placeDto(db.prepare('SELECT * FROM stations WHERE id=?').get(place.id)));
  }));
  app.patch('/api/admin/places/:id', (req, res) => {
    const previous = db.prepare('SELECT * FROM stations WHERE id=?').get(req.params.id) as any;
    if (!previous) throw new ApiError('Estabelecimento não encontrado.', 404);
    const name = text(req.body.name, 150, true), address = text(req.body.address, 250), description = text(req.body.description || '', 1000), phone = text(req.body.phone || '', 50), website = text(req.body.website || '', 300), hours = text(req.body.openingHours || '', 200);
    if (website && !/^https?:\/\//i.test(website)) throw new ApiError('Use um endereço de site iniciado por http:// ou https://.');
    if (website) { try { new URL(website); } catch { throw new ApiError('Endereço de site inválido.'); } }
    if (typeof req.body.active !== 'boolean') throw new ApiError('Confirme se o cadastro está ativo.');
    transaction(() => {
      db.prepare('UPDATE stations SET name=?,address=?,description=?,website=?,phone=?,opening_hours=?,hours_verified_at=?,active=?,managed=1 WHERE id=?')
        .run(name, address, description, website, phone, hours || null, req.body.hoursVerified === true && hours ? now() : previous.opening_hours === hours ? previous.hours_verified_at : null, Number(req.body.active), req.params.id);
      audit(user(res).id, 'places', req.params.id, 'update', JSON.stringify({ before: { name: previous.name, active: previous.active }, after: { name, active: req.body.active } }));
    });
    res.json(placeDto(db.prepare('SELECT * FROM stations WHERE id=?').get(req.params.id)));
  });
  app.delete('/api/admin/places/:id', (req, res) => {
    if (req.body.confirmed !== true) throw new ApiError('Confirme a exclusão do estabelecimento.');
    activePlace(req.params.id);
    transaction(() => { db.prepare('UPDATE stations SET active=0,managed=1 WHERE id=?').run(req.params.id); audit(user(res).id, 'places', req.params.id, 'delete'); });
    res.json({ ok: true });
  });
  app.get('/api/admin/places/:id/history', (req, res) => {
    if (!db.prepare('SELECT id FROM stations WHERE id=?').get(req.params.id)) throw new ApiError('Estabelecimento não encontrado.', 404);
    res.json({ items: priceHistory(db, req.params.id) });
  });
  app.post('/api/admin/stations/:id/prices', (req, res) => {
    activePlace(req.params.id, true);
    if (req.body.confirmed !== true || !Array.isArray(req.body.prices) || req.body.prices.length < 1 || req.body.prices.length > 12) throw new ApiError('Preencha e confirme pelo menos um preço.');
    const prices = req.body.prices.map((draft: unknown) => validate(() => validatePriceDraft(draft)));
    const keys = prices.map((draft: any) => `${draft.fuelType}:${draft.customLabel || ''}`);
    if (new Set(keys).size !== keys.length) throw new ApiError('Informe cada combustível apenas uma vez.');
    const observedAt = observationDate(req.body.observedAt);
    const photoId = req.body.photoId || null;
    const photo = photoId ? db.prepare('SELECT id,user_id,status FROM photos WHERE id=? AND station_id=?').get(photoId, req.params.id) as any : null;
    if (photoId && (!photo || !['pending', 'approved'].includes(photo.status))) throw new ApiError('Foto indisponível para aprovação.');
    const pendingId = req.body.pendingPriceId || null;
    const pending = pendingId ? db.prepare("SELECT * FROM prices WHERE id=? AND station_id=? AND status='pending_review'").get(pendingId, req.params.id) as any : null;
    if (pendingId && (!pending || prices.length !== 1 || pending.photo_id !== photoId || keys[0] !== `${pending.fuel_type}:${pending.custom_label || ''}`)) throw new ApiError('A contribuição pendente não corresponde aos valores revisados.', 409);
    const entries: string[] = [];
    transaction(() => {
      for (const draft of prices) {
        const old = db.prepare("SELECT id FROM prices WHERE station_id=? AND fuel_type=? AND COALESCE(custom_label,'')=? AND status='published' ORDER BY approved_at DESC,rowid DESC LIMIT 1").get(req.params.id, draft.fuelType, draft.customLabel || '') as any;
        const id = randomUUID(); entries.push(id);
        db.prepare(`INSERT INTO prices(id,station_id,user_id,fuel_type,custom_label,price,observed_at,created_at,source,photo_id,status,approved_at,approved_by,supersedes_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,'published',?,?,?)`).run(id, req.params.id, photo?.user_id || pending?.user_id || user(res).id, draft.fuelType, draft.customLabel || null, draft.price, observedAt, now(), photoId ? 'photo' : pending ? 'manual' : 'admin', photoId, now(), user(res).id, old?.id || null);
        audit(user(res).id, 'prices', id, old ? 'correct_and_publish' : 'approve_and_publish', text(req.body.notes || '', 300));
      }
      if (pending) db.prepare("UPDATE prices SET status='reviewed' WHERE id=?").run(pending.id);
      if (photo) { db.prepare("UPDATE photos SET status='approved' WHERE id=?").run(photo.id); audit(user(res).id, 'photos', photo.id, 'approve_and_publish'); }
    });
    res.status(201).json({ message: 'Preços aprovados e publicados.', ids: entries });
  });

  app.get('/api/admin/users', (req, res) => {
    const q = text(String(req.query.q || ''), 100);
    res.json(pageResult(req, `SELECT id,display_name AS displayName,email,role,created_at AS createdAt,blocked_at AS blockedAt FROM users WHERE deleted_at IS NULL AND (display_name LIKE ? OR email LIKE ?) ORDER BY created_at DESC,rowid DESC`,
      'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND (display_name LIKE ? OR email LIKE ?)', [`%${q}%`, `%${q}%`]));
  });
  app.post('/api/admin/users/:id', (req, res) => {
    const account = db.prepare('SELECT id,role FROM users WHERE id=? AND deleted_at IS NULL').get(req.params.id) as any;
    const action = req.body.action;
    if (!account) throw new ApiError('Usuário não encontrado.', 404);
    if (!['block', 'unblock', 'delete'].includes(action)) throw new ApiError('Ação inválida.');
    if (account.id === user(res).id && action !== 'unblock') throw new ApiError('Você não pode bloquear ou excluir sua própria conta.');
    if (action === 'delete' && req.body.confirmed !== true) throw new ApiError('Confirme a exclusão da conta.');
    if (account.role === 'admin' && action !== 'unblock' && (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND blocked_at IS NULL AND deleted_at IS NULL").get() as any).count <= 1) throw new ApiError('Mantenha pelo menos um administrador ativo.');
    transaction(() => {
      if (action !== 'unblock') db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      if (action !== 'unblock') {
        db.prepare('UPDATE convoy_members SET sharing=0,lat=NULL,lng=NULL,location_at=NULL WHERE user_id=?').run(account.id);
        db.prepare("UPDATE convoys SET status='completed',updated_at=? WHERE organizer_id=?").run(now(), account.id);
        db.prepare("UPDATE convoy_members SET sharing=0,lat=NULL,lng=NULL,location_at=NULL WHERE convoy_id IN (SELECT id FROM convoys WHERE organizer_id=?)").run(account.id);
      }
      if (action === 'delete') {
        db.prepare('DELETE FROM traveler_states WHERE user_id=?').run(account.id);
        db.prepare("UPDATE toll_entries SET image_data=NULL,notes='',status=CASE WHEN status='pending' THEN 'rejected' ELSE status END WHERE user_id=?").run(account.id);
        db.prepare('DELETE FROM convoy_members WHERE user_id=?').run(account.id);
        db.prepare('UPDATE convoys SET snapshot=? WHERE organizer_id=?').run(JSON.stringify({ title: 'Comboio encerrado', tripTitle: '', originName: '', destinationName: '', routePath: [], meetingPoints: [] }), account.id);
        db.prepare('DELETE FROM shared_routes WHERE user_id=?').run(account.id);
        db.prepare('DELETE FROM photo_uploads WHERE user_id=?').run(account.id);
        db.prepare('DELETE FROM photos WHERE user_id=?').run(account.id);
        db.prepare('DELETE FROM votes WHERE user_id=?').run(account.id);
        db.prepare("UPDATE prices SET status='rejected' WHERE user_id=? AND status='pending_review'").run(account.id);
        db.prepare("UPDATE comments SET body='',status='removed' WHERE user_id=?").run(account.id);
        db.prepare("UPDATE reports SET details='' WHERE user_id=?").run(account.id);
        db.prepare("UPDATE users SET email=?,display_name='Usuário excluído',password_hash='',role='user',deleted_at=?,blocked_at=? WHERE id=?").run(`${account.id}@deleted.invalid`, now(), now(), account.id);
      } else db.prepare('UPDATE users SET blocked_at=? WHERE id=?').run(action === 'block' ? now() : null, account.id);
      audit(user(res).id, 'users', account.id, action);
    });
    res.json({ ok: true });
  });
  app.get('/api/admin/comments', (req, res) => res.json(pageResult(req,
    `SELECT c.id,c.body,c.status,c.created_at AS createdAt,c.place_id AS placeId,s.name AS placeName,u.display_name AS displayName
    FROM comments c JOIN stations s ON s.id=c.place_id JOIN users u ON u.id=c.user_id WHERE c.status IN ('pending','published') ORDER BY c.status='pending' DESC,c.created_at DESC,c.rowid DESC`,
    "SELECT COUNT(*) AS count FROM comments WHERE status IN ('pending','published')")));
  app.get('/api/admin/reports', (req, res) => {
    const result = pageResult(req, "SELECT id,target_type AS targetType,target_id AS targetId,reason,details,created_at AS createdAt FROM reports WHERE status='open' ORDER BY created_at DESC,rowid DESC", "SELECT COUNT(*) AS count FROM reports WHERE status='open'");
    result.items = (result.items as any[]).map(report => {
      const table = ['prices', 'photos', 'comments'].includes(report.targetType) ? report.targetType : 'comments';
      const target = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(report.targetId) as any;
      const place = target && db.prepare('SELECT name FROM stations WHERE id=?').get(target.station_id || target.place_id) as any;
      return { ...report, placeName: place?.name, content: target?.body || (target?.price ? `${target.fuel_type}: R$ ${target.price}` : undefined), photoId: report.targetType === 'photos' ? target?.id : target?.photo_id };
    });
    res.json(result);
  });
  app.post('/api/admin/review/:type/:id', (req, res) => {
    const table = req.params.type;
    if (!['photos', 'prices', 'reports', 'comments'].includes(table)) throw new ApiError('Tipo inválido.');
    const target = db.prepare(`SELECT id,status FROM ${table} WHERE id=?`).get(req.params.id) as any;
    if (!target) throw new ApiError('Item não encontrado.', 404);
    const action = req.body.action;
    const notes = text(req.body.notes || '', 300);
    let status: string;
    if (table === 'reports' && action === 'resolve') status = 'resolved';
    else if (table === 'comments' && ['approve', 'reject', 'delete'].includes(action) && (action !== 'approve' || target.status === 'pending')) status = action === 'approve' ? 'published' : 'removed';
    else if (['photos', 'prices'].includes(table) && action === 'reject') status = 'rejected';
    else if (table === 'photos' && action === 'request_new' && notes) status = 'new_requested';
    else throw new ApiError('Escolha uma ação válida. Nova foto precisa de uma justificativa.');
    transaction(() => {
      db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(status, target.id);
      if (table === 'photos') db.prepare("UPDATE prices SET status='rejected' WHERE photo_id=? AND status='pending_review'").run(target.id);
      audit(user(res).id, table, target.id, action, notes);
    });
    res.json({ ok: true });
  });
  app.get('/api/admin/audit', (req, res) => res.json(pageResult(req,
    'SELECT m.id,m.target_type AS targetType,m.target_id AS targetId,m.action,m.notes,m.created_at AS createdAt,u.display_name AS administrator FROM moderation_actions m JOIN users u ON u.id=m.moderator_id ORDER BY m.created_at DESC,m.rowid DESC',
    'SELECT COUNT(*) AS count FROM moderation_actions')));
}


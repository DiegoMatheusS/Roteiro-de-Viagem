import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { ApiError, administrator, auth, clientIp, now, user, validate } from './http';
import { validateCoordinates, type Coordinates } from './maps';
import { ROAD_ALERT_TTL_MS, ROAD_ALERT_TYPES, type RoadAlertType } from '../src/types/roadAlerts';

function distanceToSegmentKm(point: Coordinates, a: Coordinates, b: Coordinates): number {
  const factor = Math.max(0.01, Math.abs(Math.cos(point[0] * Math.PI / 180)));
  const x = (point[1] - a[1]) * 111.195 * factor;
  const y = (point[0] - a[0]) * 111.195;
  const dx = (b[1] - a[1]) * 111.195 * factor;
  const dy = (b[0] - a[0]) * 111.195;
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / Math.max(dx * dx + dy * dy, 1e-12)));
  return Math.hypot(x - t * dx, y - t * dy);
}
export function distanceToRouteKm(point: Coordinates, path: Coordinates[]): number {
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    nearest = Math.min(nearest, distanceToSegmentKm(point, path[i - 1], path[i]));
  }
  return nearest;
}

const toPublic = (row: any) => ({
  id: row.id as string, kind: row.kind as RoadAlertType, lat: row.lat as number,
  lng: row.lng as number, note: row.note as string, createdAt: row.created_at as string,
  expiresAt: row.expires_at as string
});
const toAdmin = (row: any) => ({
  ...toPublic(row), status: row.status as string, submittedBy: row.submitter as string,
  reviewedAt: row.reviewed_at as string | null
});

/** Apenas coordenadas e ocorrências verificáveis. Nunca publica relatos pendentes como fatos. */
export function registerRoadAlertRoutes(app: Express, db: FuelDatabase, limit: (key: string, max: number, ms: number) => void) {
  app.post('/api/road-alerts', auth, (req, res) => {
    const reporter = user(res);
    limit(`road-alert-submit:${reporter.id}`, 4, 3600000);
    limit(`road-alert-ip:${clientIp(req)}`, 8, 3600000);
    const kind: RoadAlertType = req.body?.kind;
    if (!ROAD_ALERT_TYPES.some(item => item.id === kind)) throw new ApiError('Selecione uma ocorrência válida.');
    const [[lat, lng]] = validate(() => validateCoordinates([req.body?.coords]));
    const note = req.body?.note ?? '';
    if (typeof note !== 'string' || note.length > 200) throw new ApiError('A descrição deve ter até 200 caracteres.');
    // A posição deve vir de GPS com sinal recente; o servidor não pode confiar em alegações de precisão.
    const accuracy = req.body?.accuracyMeters, timestamp = req.body?.locationTimestamp;
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 80 ||
      typeof timestamp !== 'number' || !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 5000 || Date.now() - timestamp > 60000) {
      throw new ApiError('Para informar, ative o GPS preciso e obtenha uma localização recente.');
    }
    const count = db.prepare("SELECT count(*) AS n FROM road_alerts WHERE user_id=? AND created_at>?")
      .get(reporter.id, new Date(Date.now() - 86400000).toISOString()) as { n: number };
    if (count.n >= 12) throw new ApiError('Limite diário de alertas atingido.', 429);
    const id = randomUUID(), createdAt = now();
    const expiresAt = new Date(Date.now() + ROAD_ALERT_TTL_MS[kind]).toISOString();
    db.prepare(`INSERT INTO road_alerts(id,user_id,kind,lat,lng,note,status,created_at,expires_at)
      VALUES(?,?,?,?,?,?,'pending',?,?)`)
      .run(id, reporter.id, kind, lat, lng, note.trim(), createdAt, expiresAt);
    res.status(201).json({ id, status: 'pending', message: 'Alerta enviado para análise. Ainda não aparece publicamente.' });
  });

  app.post('/api/road-alerts/route', (req, res) => {
    limit(`road-alert-read:${clientIp(req)}`, 30, 60000);
    const path = validate(() => validateCoordinates(req.body?.routePath));
    if (path.length < 2 || path.length > 2500) throw new ApiError('Informe uma rota válida de 2 a 2500 coordenadas.');
    const latitudes = path.map(p => p[0]), longitudes = path.map(p => p[1]);
    // Filtra por caixa delimitadora antes da checagem exata por distância da geometria.
    const minLat = Math.max(-90, Math.min(...latitudes) - 0.02);
    const maxLat = Math.min(90, Math.max(...latitudes) + 0.02);
    const minLng = Math.max(-180, Math.min(...longitudes) - 0.04);
    const maxLng = Math.min(180, Math.max(...longitudes) + 0.04);
    const entries = db.prepare(`SELECT * FROM road_alerts
      WHERE status='approved' AND expires_at>? AND lat BETWEEN ? AND ?
      AND lng BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 500`)
      .all(now(), minLat, maxLat, minLng, maxLng) as any[];
    const alerts = entries.filter(entry => distanceToRouteKm([entry.lat, entry.lng], path) <= 0.35)
      .slice(0, 100).map(toPublic);
    res.json({ alerts, source: 'Contribuições verificadas pelo administrador', updatedAt: now() });
  });

  app.get('/api/road-alerts/mine', auth, (_req, res) => {
    const entries = db.prepare('SELECT * FROM road_alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 30')
      .all(user(res).id) as any[];
    res.json({ alerts: entries.map(entry => ({
      ...toPublic(entry), status: entry.expires_at <= now() ? 'expired' : entry.status
    })) });
  });

  app.get('/api/admin/road-alerts', auth, administrator, (req, res) => {
    const status = String(req.query.status || 'pending');
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new ApiError('Estado inválido.');
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new ApiError('Página inválida.');
    const offset = (page - 1) * 20;
    const total = (db.prepare('SELECT COUNT(*) AS n FROM road_alerts WHERE status=? AND expires_at>?')
      .get(status, now()) as { n: number }).n;
    const rows = db.prepare(`SELECT a.*,u.display_name AS submitter FROM road_alerts a
      LEFT JOIN users u ON u.id=a.user_id WHERE a.status=? AND a.expires_at>?
      ORDER BY a.created_at DESC LIMIT 20 OFFSET ?`)
      .all(status, now(), offset) as any[];
    res.json({ items: rows.map(toAdmin), total, page, pageSize: 20 });
  });

  app.post('/api/admin/road-alerts/:id/review', auth, administrator, (req, res) => {
    limit(`road-alert-review:${user(res).id}`, 90, 60000);
    const action = req.body?.action;
    if (action !== 'approve' && action !== 'reject') throw new ApiError('Escolha aprovar ou rejeitar.');
    const row = db.prepare('SELECT id,expires_at,status FROM road_alerts WHERE id=?')
      .get(req.params.id) as { id: string; expires_at: string; status: string } | undefined;
    if (!row || row.status !== 'pending') throw new ApiError('Alerta indisponível para revisão.', 409);
    if (row.expires_at <= now()) throw new ApiError('A ocorrência expirou. Peça um novo registro.', 409);
    const reviewedAt = now();
    db.exec('BEGIN');
    try {
      const updated = db.prepare(`UPDATE road_alerts SET status=?,reviewed_by=?,reviewed_at=?
        WHERE id=? AND status='pending' AND expires_at>?`)
        .run(action === 'approve' ? 'approved' : 'rejected', user(res).id, reviewedAt, row.id, reviewedAt);
      if (updated.changes !== 1) throw new ApiError('Este alerta já foi analisado.', 409);
      db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(), user(res).id, 'road_alerts', row.id, action, '', reviewedAt);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected' });
  });
}

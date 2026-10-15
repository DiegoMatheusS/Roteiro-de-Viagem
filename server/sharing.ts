import type { Express } from 'express';
import { randomBytes } from 'node:crypto';
import type { FuelDatabase } from './db';
import { clientIp, ApiError, now, user } from './http';
import { distanceBetweenKm } from '../src/services/gpsTracking';
import { sampleRoutePath } from '../src/types/itinerary';
import type { SharedRoute } from '../src/types/sharedRoute';

export function registerSharingRoutes(app: Express, db: FuelDatabase, limit: (key: string, max: number, window: number) => void) {
  app.post('/api/routes/share', (req, res) => {
    limit(`sharing:${user(res)?.id || clientIp(req)}`, 10, 3600000);
    const raw = req.body.trip;
    const text = (value: unknown, max: number) => { if (typeof value !== 'string' || value.length > max) throw new ApiError('Roteiro de compartilhamento inválido.'); return value; };
    const coords = (value: unknown): [number, number] => { if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 90 || Math.abs(value[1]) > 180) throw new ApiError('Localização de compartilhamento inválida.'); return [value[0], value[1]]; };
    if (!raw || !Array.isArray(raw.stops) || raw.stops.length > 30 || !Array.isArray(raw.routePath) || raw.routePath.length < 2 || raw.routePath.length > 2500 || !Number.isFinite(raw.distanceKm) || raw.distanceKm < 0 || raw.distanceKm > 50000 || !Number.isInteger(raw.durationMinutes) || raw.durationMinutes < 0 || raw.durationMinutes > 500000) throw new ApiError('Roteiro de compartilhamento inválido.');
    const origin = coords(raw.originCoords), destination = coords(raw.destinationCoords);
    const protectedOrigin = req.body.protectOrigin !== false;
    const approximate = (point: [number, number]): [number, number] => point.map(n => Number(n.toFixed(2))) as [number, number];
    const sameOrigin = (point: [number, number]) => distanceBetweenKm(point, origin) < 0.05;
    const publicOrigin = protectedOrigin ? approximate(origin) : origin;
    const publicDestination = protectedOrigin && sameOrigin(destination) ? publicOrigin : destination;
    const stops: SharedRoute['stops'] = raw.stops.map((stop: any) => {
      if (!stop || !Number.isInteger(stop.recommendedMinutes) || stop.recommendedMinutes < 0 || stop.recommendedMinutes > 1440) throw new ApiError('Permanência inválida.');
      const point = coords([stop.lat, stop.lng]), hide = protectedOrigin && sameOrigin(point);
      return { name: hide ? 'Parada na região de partida' : text(stop.name, 150), category: text(stop.category, 50), description: hide ? '' : text(stop.description || '', 1000),
        coords: hide ? publicOrigin : point, type: stop.type === 'mandatory' ? 'mandatory' : 'suggested', stayMinutes: stop.recommendedMinutes };
    });
    const path = (raw.routePath as unknown[]).map(coords).filter(point => !protectedOrigin || distanceBetweenKm(point, origin) >= 2);
    const snapshot: SharedRoute = { title: protectedOrigin ? 'Roteiro compartilhado' : text(raw.title, 300), originName: protectedOrigin ? 'Região de partida' : text(raw.originName, 150),
      destinationName: protectedOrigin && sameOrigin(destination) ? 'Retorno à região de partida' : text(raw.destinationName, 150), originCoords: publicOrigin, destinationCoords: publicDestination,
      routePath: sampleRoutePath([publicOrigin, ...path, publicDestination], 400), distanceKm: raw.distanceKm, durationMinutes: raw.durationMinutes, stops, protectedOrigin,
      routingSource: raw.routingSource === 'OSRM' ? 'OSRM' : undefined };
    const id = randomBytes(18).toString('base64url'), expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    db.prepare('DELETE FROM shared_routes WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO shared_routes VALUES(?,?,?,?,?)').run(id, user(res)?.id || null, JSON.stringify(snapshot), now(), expiresAt);
    res.status(201).json({ id, expiresAt });
  });
  app.get('/api/routes/share/:id', (req, res) => {
    const row = db.prepare('SELECT snapshot,expires_at FROM shared_routes WHERE id=? AND expires_at>?').get(req.params.id, now()) as any;
    if (!row) throw new ApiError('Este roteiro não está disponível ou o link expirou.', 404);
    res.json({ ...JSON.parse(row.snapshot), expiresAt: row.expires_at });
  });
}

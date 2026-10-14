import type { Express } from 'express';
import type { FuelDatabase } from './db';
import { ApiError, auth, now, user } from './http';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const textField = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const count = (value: unknown, max = 10000000) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const coords = (v: unknown) => Array.isArray(v) && v.length === 2 &&
  v.every((n, i) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= (i === 0 ? 90 : 180));
const list = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;

function validateState(value: unknown, accountId: string): Json {
  if (!object(value)) throw new ApiError('Dados da conta inválidos.');
  const { profile, vehicles, fuelLogs, achievements, trips, activeTrip, selectedVehicleId } = value;
  if (!object(profile) || !textField(profile.name, 80) || !(profile.name as string).trim() ||
      !list(profile.emergencyContacts, 12) || !count(profile.verifiedGpsKm) ||
      !count(profile.manualKm) || !count(profile.completedTripsCount, 100000) ||
      !textField(profile.bio ?? '', 3000) || !textField(profile.homeAddress ?? '', 500) ||
      (profile.homeCoordinates != null && !coords(profile.homeCoordinates))) throw new ApiError('Perfil inválido.');
  if (!(profile.emergencyContacts as unknown[]).every(contact => object(contact) &&
      textField(contact.name, 100) && textField(contact.phone, 40) &&
      textField(contact.relationship, 80))) throw new ApiError('Contato de emergência inválido.');

  if (!list(vehicles, 30) || !(vehicles as unknown[]).every(item => object(item) &&
      textField(item.id, 100) && textField(item.nickname, 150) &&
      textField(item.brand, 100) && textField(item.model, 150) &&
      count(item.odometerKm, 10000000) && count(item.tankCapacityLiters, 2000) &&
      object(item.consumption) && count(item.consumption.userConfigured, 1000))) throw new ApiError('Garagem inválida.');

  if (!list(fuelLogs, 3000) || !(fuelLogs as unknown[]).every(item => object(item) &&
      textField(item.id, 100) && textField(item.vehicleId, 100) &&
      textField(item.date, 30) && count(item.liters, 2000) &&
      count(item.pricePerLiter, 1000) && count(item.odometerKm))) throw new ApiError('Histórico de abastecimentos inválido.');

  if (!list(achievements, 50) || !(achievements as unknown[]).every(item => object(item) &&
      textField(item.id, 100) && count(item.progress) &&
      (item.unlockedAt === null || textField(item.unlockedAt, 50)))) throw new ApiError('Conquistas inválidas.');

  const validTrip = (trip: unknown): trip is Json =>
    object(trip) && textField(trip.id, 120) && textField(trip.title, 400) &&
    coords(trip.originCoords) && coords(trip.destinationCoords) &&
    count(trip.distanceKm, 50000) && count(trip.durationMinutes, 500000) &&
    ['planned', 'in_progress', 'completed'].includes(String(trip.status)) &&
    list(trip.routePath, 2500) && (trip.routePath as unknown[]).every(coords) &&
    list(trip.stops, 80) && textField(trip.vehicleId, 120);
  if (!list(trips, 150) || !(trips as unknown[]).every(validTrip) ||
      (activeTrip != null && !validTrip(activeTrip)) ||
      !textField(selectedVehicleId, 120)) throw new ApiError('Viagens inválidas.');

  // Never trust an ID supplied in the request body as the account owner.
  return { profile: { ...profile, id: accountId }, vehicles, fuelLogs, achievements,
    trips, activeTrip: activeTrip ?? null, selectedVehicleId };
}

export function registerTravelerStateRoutes(app: Express, db: FuelDatabase,
  limit: (key: string, max: number, windowMs: number) => void) {
  app.get('/api/me/state', auth, (_req, res) => {
    const owner = user(res).id;
    const row = db.prepare('SELECT snapshot,revision,updated_at FROM traveler_states WHERE user_id=?')
      .get(owner) as { snapshot: string; revision: number; updated_at: string } | undefined;
    res.json(row ? { state: JSON.parse(row.snapshot), revision: row.revision, updatedAt: row.updated_at } :
      { state: null, revision: 0, updatedAt: null });
  });

  app.put('/api/me/state', auth, (req, res) => {
    const owner = user(res).id;
    limit(`traveler-state:${owner}`, 60, 60000);
    const expectedRevision = req.body?.revision;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new ApiError('Revisão inválida.');
    const state = validateState(req.body.state, owner);
    const snapshot = JSON.stringify(state);
    if (Buffer.byteLength(snapshot, 'utf8') > 1200000) throw new ApiError('Histórico muito grande. Salve menos viagens por vez.', 413);
    const current = db.prepare('SELECT revision FROM traveler_states WHERE user_id=?').get(owner) as { revision: number } | undefined;
    if ((current?.revision ?? 0) !== expectedRevision) {
      throw new ApiError('Os dados desta conta foram alterados em outro dispositivo. Seus dados locais foram preservados; atualize antes de sincronizar novamente.', 409);
    }
    const revision = expectedRevision + 1, changedAt = now();
    if (current) {
      const result = db.prepare('UPDATE traveler_states SET snapshot=?,revision=?,updated_at=? WHERE user_id=? AND revision=?')
        .run(snapshot, revision, changedAt, owner, expectedRevision);
      if (!result.changes) throw new ApiError('Conflito na sincronização.', 409);
    } else {
      db.prepare('INSERT INTO traveler_states(user_id,snapshot,revision,updated_at) VALUES(?,?,?,?)')
        .run(owner, snapshot, revision, changedAt);
    }
    res.json({ revision, updatedAt: changedAt });
  });
}

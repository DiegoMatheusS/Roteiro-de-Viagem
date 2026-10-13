import type { FuelDatabase } from './db';
import type { FuelPrice, FuelStation } from '../src/types/fuel';
import { priceReliability } from '../src/services/fuelPriceRules';

export function stationDetails(db: FuelDatabase, stationId: string, userId?: string): FuelStation | null {
  const station = db.prepare('SELECT * FROM stations WHERE id=?').get(stationId) as any;
  if (!station) return null;
  const rows = db.prepare(`SELECT p.*, ph.status AS photo_status,
    (SELECT COUNT(*) FROM votes WHERE price_id=p.id AND vote='confirm') AS confirmations,
    (SELECT COUNT(*) FROM votes WHERE price_id=p.id AND vote='contest') AS contests,
    (SELECT COUNT(*) FROM prices h WHERE h.user_id=p.user_id AND h.status='published' AND h.id<>p.id AND EXISTS(SELECT 1 FROM votes v WHERE v.price_id=h.id AND v.vote='confirm')) AS history,
    (SELECT vote FROM votes WHERE price_id=p.id AND user_id=?) AS my_vote
    FROM prices p LEFT JOIN photos ph ON ph.id=p.photo_id WHERE p.station_id=? AND p.status='published' ORDER BY p.created_at DESC, p.rowid DESC`).all(userId || '', stationId) as any[];
  const seen = new Set<string>();
  const prices: FuelPrice[] = [];
  for (const row of rows) {
    const key = `${row.fuel_type}:${row.custom_label || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prices.push({ id: row.id, fuelType: row.fuel_type, price: row.price, customLabel: row.custom_label || undefined,
      observedAt: row.observed_at, publishedAt: row.created_at, source: row.source,
      photoId: row.photo_status === 'approved' ? row.photo_id : undefined,
      confirmations: row.confirmations, contests: row.contests,
      ...priceReliability(row.observed_at, row.confirmations, row.contests, row.history),
      myVote: row.my_vote || undefined, isMine: userId === row.user_id });
  }
  return { id: station.id, name: station.name, lat: station.lat, lng: station.lng, address: station.address,
    source: 'OpenStreetMap', sourceUrl: station.source_url, mapUpdatedAt: station.map_updated_at,
    openingHours: station.opening_hours || undefined, openingHoursVerifiedAt: station.hours_verified_at || undefined, prices };
}

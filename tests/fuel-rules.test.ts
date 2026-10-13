import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validatePriceDraft, priceReliability } from '../src/services/fuelPriceRules';
import { compareStationCost } from '../src/services/fuelComparison';
import { sanitizePhoto } from '../server/photos';

test('prices reject negatives, non-finite values, unsupported fuel types and excessive precision', () => {
  for (const price of [0, -1, NaN, Infinity, 51, 5.12345]) assert.throws(() => validatePriceDraft({ fuelType: 'gasolina_comum', price }));
  assert.throws(() => validatePriceDraft({ fuelType: 'unknown', price: 5 }));
  assert.throws(() => validatePriceDraft({ fuelType: 'outro', price: 5 }));
});
test('reliability uses freshness, votes and contributor history; old prices stay stale', () => {
  const current = Date.now();
  const fresh = priceReliability(new Date(current).toISOString(), 4, 0, 5, current);
  const old = priceReliability(new Date(current - 96 * 3600000).toISOString(), 10, 0, 5, current);
  assert.equal(fresh.reliability, 'Alta'); assert.equal(old.stale, true);
  assert.equal(priceReliability(new Date(current).toISOString(), 0, 1, 0, current).disputed, true);
});
test('the cheapest liter can cost more overall after a road detour', () => {
  const station = { id: 'test' } as any;
  const distant = compareStationCost(station, { price: 5 } as any, { litersToBuy: 20, consumptionKmPerLiter: 10, remainingFuelLiters: 1, baselineKm: 100, viaStationKm: 300, distanceToStationKm: 50 });
  const nearby = compareStationCost(station, { price: 5.5 } as any, { litersToBuy: 20, consumptionKmPerLiter: 10, remainingFuelLiters: 1, baselineKm: 100, viaStationKm: 100, distanceToStationKm: 5 });
  assert.equal(distant.totalCost, 200); assert.equal(nearby.totalCost, 110);
  assert.equal(distant.reachable, false); assert.equal(nearby.reachable, true);
});
test('photos are re-encoded without EXIF or location metadata', async () => {
  const original = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'white' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private test person', ImageDescription: 'Private location' } } }).toBuffer();
  assert.ok((await sharp(original).metadata()).exif);
  const sanitized = await sanitizePhoto(original);
  const metadata = await sharp(sanitized).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
  await assert.rejects(sanitizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>')));
});

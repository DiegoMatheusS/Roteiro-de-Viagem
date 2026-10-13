import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validatePriceDraft, parseFuelPriceText, priceReliability } from '../src/services/fuelPriceRules';
import { compareStationCost } from '../src/services/fuelComparison';
import { sanitizePhoto, extractPrices } from '../server/photos';

test('OCR parser maps only recognized fuels and decimal prices; never fills missing values', () => {
  assert.deepEqual(parseFuelPriceText('Gasolina comum 5,899\nEtanol\n3,799\nDiesel S10 6.499\nGasolina aditivada ilegivel'), [{ fuelType: 'gasolina_comum', price: 5.899 }, { fuelType: 'etanol', price: 3.799 }, { fuelType: 'diesel_s10', price: 6.499 }]);
  assert.deepEqual(parseFuelPriceText('PROMOCAO 123\nGasolina sem valor\nTelefone 1199999999'), []);
  assert.deepEqual(parseFuelPriceText('GASOLINA 5,999\nGASOLINA 5,899\nGASOLINA 6,199'), []);
});
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
test('local OCR reads a sign and returns drafts without publishing', { timeout: 45000 }, async () => {
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="500"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" font-size="64" fill="black"><text x="40" y="130">GASOLINA COMUM 5,899</text><text x="40" y="250">ETANOL 3,799</text><text x="40" y="370">DIESEL S10 6,499</text></g></svg>')).png().toBuffer();
  const result = await extractPrices(image);
  assert.equal(result.prices.length, 3);
  assert.equal(result.prices[0].price, 5.899);
});

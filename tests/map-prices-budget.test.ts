import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogTollForVehicle, fuelMarkerPrice, tollMarkerPrice } from '../src/services/mapPrices';
import { fuelEstimatePatch } from '../src/services/tripBudget';
import type { Place } from '../src/types/admin';
import type { Vehicle } from '../src/types';
import { createRoadDraft } from '../src/services/touristCircuit';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { minimalMapStyle } from '../src/services/minimalMapStyle';

test('estilo vetorial é válido para o renderizador', () => {
  assert.deepEqual(validateStyleMin(minimalMapStyle()), []);
});

test('tarifa separa carro e moto, ignora vencidas e não inventa sentido', () => {
  const place = { id: 'toll', name: 'Pedágio', lat: 0, lng: 0, sourceUrl: '', tollTariffs: [
    { id: 'car', vehicleType: 'car', price: 12, headingDegrees: 90, observedAt: '2026-01-01', validUntil: '2026-02-01' },
    { id: 'bike', vehicleType: 'motorcycle', price: 0, headingDegrees: null, observedAt: '2026-01-01', validUntil: '2026-02-01' }
  ] } as Place;
  const car = catalogTollForVehicle(place, 'car', Date.parse('2026-01-15'));
  assert.equal(car.price, null);
  assert.match(tollMarkerPrice(car), /A partir de/);
  assert.equal(catalogTollForVehicle(place, 'motorcycle', Date.parse('2026-01-15')).price, 0);
  assert.equal(catalogTollForVehicle(place, 'car', Date.parse('2026-03-01')).tariffs?.length, 0);
});

test('posto não anuncia preço vencido, contestado ou de outro combustível', () => {
  const station = { prices: [ { fuelType: 'etanol', price: 4, stale: false }, { fuelType: 'gasolina_comum', price: 6, stale: true }, { fuelType: 'gasolina_comum', price: 7, stale: false, disputed: true } ] } as any;
  assert.equal(fuelMarkerPrice(station, 'gasolina_comum'), 'Preço não informado');
  assert.match(fuelMarkerPrice(station, 'etanol'), /4,00/);
});

test('orçamento usa km rodoviários, consumo, veículos e divisão sem arredondar litros antes do custo', () => {
  const vehicle = { id: 'v', fuelType: 'gasolina', consumption: { userConfigured: 12, referenceAverage: 15 } } as Vehicle;
  const trip = { ...createRoadDraft({ originName: 'A', destinationName: 'B', originCoords: [0, 0], destinationCoords: [0, 1], vehicle, circular: false, limits: { mode: 'destination' } }), distanceKm: 100, vehicleGroupType: 'multi_vehicle' as const, groupVehiclesCount: 2, knownTollsCost: 20, totalFoodCost: 30, peopleCount: 4, splitExpenses: true };
  const result = fuelEstimatePatch(trip, vehicle, 6);
  assert.equal(result.estimatedFuelCost, 100);
  assert.equal(result.totalEstimatedCost, 150);
  assert.equal(result.costPerPerson, 37.5);
  assert.equal(fuelEstimatePatch(trip, vehicle, NaN).fuelPricePerLiter, 0);
});

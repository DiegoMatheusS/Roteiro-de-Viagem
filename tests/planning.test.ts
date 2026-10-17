import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateObservedConsumption } from '../src/services/fuelConsumption';
import { getPlanningAlternatives, buildPlannedTrip } from '../src/services/routeCalculator';
import { createRoadDraft } from '../src/services/touristCircuit';
import { storageService } from '../src/services/storageService';
import { convoyService } from '../src/services/convoyService';
import { createGpsTrackingState, recordGpsPosition } from '../src/services/gpsTracking';
import { getCurrentDeviceLocation, watchDeviceLocation } from '../src/services/locationService';
import type { FuelLog, Vehicle } from '../src/types';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) }, configurable: true });
const vehicle: Vehicle = {
  id: 'test-motorcycle', type: 'motorcycle', brand: 'Honda', model: 'CB 500X', year: 2024,
  nickname: 'Moto de teste', fuelType: 'gasolina', tankCapacityLiters: 17, maxPassengers: 2,
  odometerKm: 0, isDefault: true, consumption: {
    referenceUrban: 25, referenceHighway: 29, referenceAverage: 27, source: 'fixture',
    sourceDate: '2026', userConfigured: 27
  }
};
storageService.saveVehicles([vehicle]);
storageService.setSelectedVehicleId(vehicle.id);
const log = (odometerKm: number, liters: number, fullTank: boolean): FuelLog => ({ id: String(odometerKm), vehicleId: vehicle.id, date: '2026-10-13', odometerKm, liters, fullTank, pricePerLiter: 5, totalAmount: 5 * liters });

test('consumption includes partial refills between full tanks and leaves the incomplete interval out', () => {
  assert.equal(calculateObservedConsumption([log(1000, 20, true), log(1100, 5, false), log(1200, 5, true), log(1250, 10, false)]), 20);
  assert.equal(calculateObservedConsumption([log(1000, 10, true), log(1100, 5, false)]), undefined);
});
test('partial consumption updates the vehicle used for planning', () => {
  storageService.saveFuelLogs([]);
  [log(1000, 10, true), log(1100, 5, false), log(1200, 5, true)].forEach(entry => storageService.addFuelLog(entry));
  assert.equal(storageService.getVehicles()[0].consumption.userConfigured, 20);
});
for (const mode of ['km', 'hours'] as const) for (const tripType of ['round_trip', 'one_way'] as const) {
  test(`${mode}/${tripType} preserves circuit, time, origin, stops and identity through save/start`, () => {
    const circular = tripType === 'round_trip';
    const initial = createRoadDraft({originName:'Origem do teste',originCoords:[-21,-47],
      destinationName:circular?'Origem do teste':'Destino do teste',destinationCoords:circular?[-21,-47]:[-21.1,-47.1],
      vehicle,circular,limits:{mode,target:mode==='km'?100:2.5}});
    // Uma fixture de percurso já calculado; o teste NÃO usa gerador fictício de produção.
    const trip = { ...initial, distanceKm:100, durationMinutes:150,
      routingSource:'OSRM' as const, tollsStatus:'unknown' as const,
      routePath:[[-21,-47],[-21.04,-47.06],circular?[-21,-47]:[-21.1,-47.1]] as [number,number][],
      stops:[] };
    const input = { originName: trip.originName, originCoords: trip.originCoords, destinationName: trip.destinationName, destinationCoords: trip.destinationCoords, vehicle, peopleCount: 2, vehicleGroupType: 'single_vehicle' as const, groupVehiclesCount: 1, splitExpenses: true, foodCostPerPerson: 20, fuelPricePerLiter: 6, returnModality: trip.returnModality };
    const options = getPlanningAlternatives(input, trip);
    const saved = buildPlannedTrip(input, options[0], trip);
    assert.equal(saved.distanceKm, trip.distanceKm);
    assert.equal(saved.durationMinutes, trip.durationMinutes);
    assert.equal(saved.isCircular, tripType === 'round_trip');
    assert.deepEqual(saved.routePath, trip.routePath);
    assert.deepEqual(saved.stops, trip.stops);
    assert.deepEqual(saved.originCoords, [-21, -47]);
    assert.equal(saved.id, trip.id);
    assert.equal(saved.estimatedFuelCost, Number((trip.distanceKm / vehicle.consumption.userConfigured * 6).toFixed(2)));
  });
}
test('completed distance cannot be invented for an unknown trip or duplicated', () => {
  const before = storageService.getProfile().completedTripsCount;
  assert.throws(() => storageService.completeTrip('missing', 10, true));
  assert.throws(() => storageService.completeTrip('missing', -10, false));
  assert.equal(storageService.getProfile().completedTripsCount, before);
});
test('GPS counts observed movement, ignores drift, gaps and jumps', () => {
  const sample = (lat: number, timestamp: number, accuracyMeters = 3) => ({ coords: [lat, 0] as [number, number], timestamp, accuracyMeters, speedMetersPerSecond: null });
  let state = recordGpsPosition(createGpsTrackingState(), sample(0, 1000));
  state = recordGpsPosition(state, sample(0.000001, 2000));
  assert.equal(state.distanceKm, 0);
  state = recordGpsPosition(state, sample(0.001, 11000));
  assert.ok(state.distanceKm > 0.11 && state.distanceKm < 0.12);
  const distance = state.distanceKm;
  state = recordGpsPosition(state, sample(10, 12000));
  assert.equal(state.distanceKm, distance);
  state = recordGpsPosition(state, sample(10.01, 100000));
  assert.equal(state.distanceKm, distance);
  state = recordGpsPosition(state, sample(10.02, 101000, 500));
  assert.equal(state.distanceKm, distance);
  assert.equal(state.lastPosition, null);
});
test('GPS denial rejects without fabricating coordinates', async () => {
  const denied = { getCurrentPosition: (_ok: any, fail: any) => fail({ code: 1 }) } as Geolocation;
  await assert.rejects(getCurrentDeviceLocation(denied), /Permita/);
});
test('location watcher clears on stop and ignores late callbacks', () => {
  let callback: any; let clearId: number | undefined; let received = 0;
  const geo = { watchPosition: (ok: any) => { callback = ok; return 7; }, clearWatch: (id: number) => { clearId = id; } } as Geolocation;
  const stop = watchDeviceLocation(geo, () => received++, () => {});
  stop(); callback({ coords: { latitude: 0, longitude: 0, accuracy: 3, speed: null }, timestamp: 1000 });
  assert.equal(clearId, 7); assert.equal(received, 0);
});

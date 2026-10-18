import test from 'node:test';
import assert from 'node:assert/strict';
import {GUEST_NAVIGATION_VEHICLE} from '../src/services/guestNavigationVehicle';
import {createRoadDraft} from '../src/services/touristCircuit';

test('anonymous journeys have a non-registering navigation vehicle with no invented consumption',()=>{
  const vehicle=GUEST_NAVIGATION_VEHICLE;
  assert.equal(vehicle.id,'role-guest-navigation');
  assert.equal(vehicle.consumption.userConfigured,0);
  assert.equal(vehicle.consumption.referenceAverage,0);
  const trip=createRoadDraft({
    originName:'Sua localização atual',originCoords:[-23.55,-46.63],
    destinationName:'Sua localização atual',destinationCoords:[-23.55,-46.63],
    vehicle,circular:true,limits:{mode:'km',target:40}
  });
  assert.equal(trip.vehicleId,'role-guest-navigation');
  assert.equal(trip.planningLimits?.mode,'km');
  assert.equal(trip.estimatedFuelLiters,0);
  assert.equal(trip.estimatedFuelCost,0);
  assert.equal(trip.status,'planned');
});

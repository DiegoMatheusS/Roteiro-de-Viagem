import type { TripPlan, Vehicle } from '../types';
import type { FuelKind, AppliedFuelPrice } from '../types/fuel';

export function vehicleFuelKind(vehicle?: Vehicle | null): FuelKind {
  return vehicle?.fuelType === 'diesel' ? 'diesel_comum' : vehicle?.fuelType === 'etanol' ? 'etanol' : vehicle?.fuelType === 'eletrico' ? 'eletrico' : 'gasolina_comum';
}
export function fuelEstimatePatch(trip: TripPlan, vehicle: Vehicle, price: number, source?: AppliedFuelPrice): Partial<TripPlan> {
  const consumption = source?.consumptionKmPerLiter || vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage;
  const vehicles = trip.vehicleGroupType === 'multi_vehicle' ? Math.max(1, trip.groupVehiclesCount) : 1;
  const liters = vehicle.fuelType !== 'eletrico' && consumption > 0 ? trip.distanceKm / consumption * vehicles : 0;
  const fuelPricePerLiter = Number.isFinite(price) && price > 0 && price <= 50 ? price : 0;
  const estimatedFuelCost = Number((liters * fuelPricePerLiter).toFixed(2));
  const totalEstimatedCost = Number((estimatedFuelCost + trip.knownTollsCost + trip.totalFoodCost).toFixed(2));
  return { fuelPricePerLiter, fuelPriceSource: source, estimatedFuelLiters: Number(liters.toFixed(2)), estimatedFuelCost, totalEstimatedCost,
    costPerPerson: trip.splitExpenses ? Number((totalEstimatedCost / Math.max(1, trip.peopleCount)).toFixed(2)) : totalEstimatedCost };
}

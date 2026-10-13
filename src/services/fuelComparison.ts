import type { FuelComparison, FuelPrice, FuelStation } from '../types/fuel';

export function compareStationCost(station: FuelStation, contribution: FuelPrice, input: {
  litersToBuy: number; consumptionKmPerLiter: number; remainingFuelLiters: number;
  baselineKm: number; viaStationKm: number; distanceToStationKm: number;
}): FuelComparison {
  const detourKm = Math.max(0, input.viaStationKm - input.baselineKm);
  const extraFuelCost = detourKm / input.consumptionKmPerLiter * contribution.price;
  const purchaseCost = input.litersToBuy * contribution.price;
  return {
    station, contribution, detourKm, distanceToStationKm: input.distanceToStationKm,
    extraFuelCost: Number(extraFuelCost.toFixed(2)), purchaseCost: Number(purchaseCost.toFixed(2)),
    totalCost: Number((purchaseCost + extraFuelCost).toFixed(2)),
    reachable: input.distanceToStationKm <= input.remainingFuelLiters * input.consumptionKmPerLiter
  };
}

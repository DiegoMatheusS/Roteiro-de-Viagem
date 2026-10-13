import type { FuelLog } from '../types';

export function calculateObservedConsumption(logs: FuelLog[]): number | undefined {
  const sorted = [...logs].sort((a, b) => a.odometerKm - b.odometerKm);
  let anchor: FuelLog | undefined;
  let intervalLiters = 0;
  let totalLiters = 0;
  let totalKm = 0;

  for (const log of sorted) {
    if (!Number.isFinite(log.odometerKm) || !Number.isFinite(log.liters) || log.liters <= 0) continue;
    if (!anchor) {
      if (log.fullTank) anchor = log;
      continue;
    }
    intervalLiters += log.liters;
    if (log.fullTank) {
      const distance = log.odometerKm - anchor.odometerKm;
      if (distance > 0 && intervalLiters > 0) {
        totalKm += distance;
        totalLiters += intervalLiters;
      }
      anchor = log;
      intervalLiters = 0;
    }
  }

  return totalKm > 0 && totalLiters > 0 ? Number((totalKm / totalLiters).toFixed(2)) : undefined;
}

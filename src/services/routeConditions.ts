import type { TripPlan, WeatherPoint, VehicleType } from '../types';
import type { DeviceLocation } from './locationService';
import type { RouteToll } from '../types/tolls';
import { fuelApi } from './fuelApi';
import { distanceBetweenKm } from './gpsTracking';
export interface WeatherResult { weatherPoints: WeatherPoint[]; hasRainRisk: boolean; source: string; updatedAt: string }
export interface TollResult { tolls: RouteToll[]; knownCost: number; status: 'unknown' | 'partial'; mapUnavailable: boolean; updatedAt: string; warning: string }
export function weatherRequestForTrip(trip: TripPlan, location?: DeviceLocation | null) {
  let path = trip.routePath, stops = trip.stops;
  let drivingMinutes = trip.drivingMinutes ?? Math.max(0,trip.durationMinutes-trip.stops.reduce((sum,s) => sum+s.recommendedMinutes,0));
  const active = trip.status === 'in_progress';
  if (active && location && Date.now()-location.timestamp >= -5000 && Date.now()-location.timestamp <= 60000 && location.accuracyMeters <= 50 && path.length > 1) {
    const along = [0]; for (let i=1;i<path.length;i++) along.push(along[i-1]+distanceBetweenKm(path[i-1],path[i]));
    const total = along.at(-1)!, expected = total*Math.min(1,(trip.trackedDistanceKm || 0)/Math.max(trip.distanceKm,0.001));
    let index=0, best=Infinity;
    for (let i=0;i<path.length;i++) {
      const score=distanceBetweenKm(location.coords,path[i])+Math.abs(along[i]-expected)*0.00001;
      if(score < best) { best=score; index=i; }
    }
    if (distanceBetweenKm(location.coords,path[index]) <= 1) {
      let lastStopIndex=0;
      stops=stops.filter(stop => {
        let closest=Infinity, stopIndex=lastStopIndex;
        for(let i=lastStopIndex;i<path.length;i++) { const d=distanceBetweenKm([stop.lat,stop.lng],path[i]); if(d<closest) { closest=d; stopIndex=i; } }
        lastStopIndex=stopIndex; return stopIndex >= index;
      });
      drivingMinutes = total > 0 ? drivingMinutes*(total-along[index])/total : 0;
      path=[location.coords,...path.slice(index)];
    }
  }
  return { routePath:path, drivingMinutes, stops:stops.map(s => ({ coords:[s.lat,s.lng] as [number,number],stayMinutes:s.recommendedMinutes })), departureAt:active ? undefined : trip.departureAt };
}
export function requestWeather(trip: TripPlan, signal?: AbortSignal, location?: DeviceLocation | null) {
  const input=weatherRequestForTrip(trip,location);
  return fuelApi<WeatherResult>('/weather/route',{method:'POST',body:JSON.stringify(input),signal}).then(result => ({...result,weatherPoints:result.weatherPoints.map((point,index) => index===0 && location && input.routePath[0]===location.coords ? {...point,locationName:'Sua localização'} : point)}));
}
export function requestTolls(trip: TripPlan, vehicleType: VehicleType, signal?: AbortSignal) {
  return fuelApi<TollResult>('/tolls/route',{ method:'POST',body:JSON.stringify({ routePath:trip.routePath,vehicleType }),signal });
}
export function tollBudgetPatch(trip: TripPlan, result: TollResult): Partial<TripPlan> {
  const vehicles = trip.vehicleGroupType === 'multi_vehicle' ? Math.max(1,trip.groupVehiclesCount) : 1;
  const knownTollsCost=Number((result.knownCost*vehicles).toFixed(2));
  const totalEstimatedCost=Number((trip.estimatedFuelCost+trip.totalFoodCost+knownTollsCost).toFixed(2));
  return { tolls:result.tolls,knownTollsCost,tollsStatus:result.status,tollsUpdatedAt:result.updatedAt,tollsMapUnavailable:result.mapUnavailable,totalEstimatedCost,
    costPerPerson:trip.splitExpenses ? Number((totalEstimatedCost/Math.max(1,trip.peopleCount)).toFixed(2)) : totalEstimatedCost };
}

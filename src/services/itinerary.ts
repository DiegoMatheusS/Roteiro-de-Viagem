import { fuelApi } from './fuelApi';
import type { TripPlan, RouteStop, Vehicle } from '../types';
import type { ItineraryResult, MandatoryStop, SuggestedStop, PlanningLimits } from '../types/itinerary';

export async function calculateItinerary(trip: TripPlan, manualStops: MandatoryStop[], acceptedSuggestions: SuggestedStop[] = [], signal?: AbortSignal) {
  if (manualStops.some(stop => !stop.location.id || !stop.location.coords)) throw new Error('Pesquise e selecione um local real para cada parada.');
  return fuelApi<ItineraryResult>('/routes/itinerary', { method: 'POST', signal, body: JSON.stringify({ originCoords: trip.originCoords, destinationCoords: trip.destinationCoords,
    roundTrip: trip.isCircular, manualStops: manualStops.map(stop => ({ id: stop.id, locationId: stop.location.id, stayMinutes: stop.stayMinutes })),
    acceptedSuggestions: acceptedSuggestions.map(stop => ({ id: stop.id, locationId: stop.location.id, stayMinutes: stop.stayMinutes, afterIndex: stop.afterIndex })), limits: trip.planningLimits || { mode: 'destination' } }) });
}
const category = (value?: string): RouteStop['category'] => ({ fuel: 'posto', restaurant: 'restaurante', cafe: 'restaurante', hotel: 'hotel', viewpoint: 'mirante', park: 'parque', museum: 'museu', city: 'cidade', town: 'cidade', mirante: 'mirante', restaurante: 'restaurante', museu: 'museu', parque: 'parque', monumento: 'monumento', cidade_historica: 'cidade_historica' } as Record<string, RouteStop['category']>)[value || ''] || 'endereco';
export function applyItinerary(trip: TripPlan, result: ItineraryResult): TripPlan {
  const stops: RouteStop[] = [];
  const append = (stop: MandatoryStop | SuggestedStop, type: 'mandatory' | 'suggested') => stops.push({ id: stop.id, name: stop.location.name, category: category(stop.location.category), lat: stop.location.coords![0], lng: stop.location.coords![1], description: stop.location.address || '', recommendedMinutes: stop.stayMinutes, type, sourceUrl: stop.location.sourceUrl });
  result.acceptedSuggestions.filter(stop => stop.afterIndex === -1).forEach(stop => append(stop, 'suggested'));
  result.manualStops.forEach((stop, index) => { append(stop, 'mandatory'); result.acceptedSuggestions.filter(stop => stop.afterIndex === index).forEach(stop => append(stop, 'suggested')); });
  if (!result.manualStops.length) result.acceptedSuggestions.filter(stop => stop.afterIndex === 0).forEach(stop => append(stop, 'suggested'));
  return { ...trip, title: `Roteiro: ${trip.originName} → ${trip.destinationName}`, distanceKm: result.distanceKm, durationMinutes: result.durationMinutes, drivingMinutes: result.drivingMinutes, routePath: result.routePath, routeSteps: result.routeSteps, manualStops: result.manualStops, acceptedSuggestions: result.acceptedSuggestions, stops, waypointOrder: result.waypoints,
    routingSource: 'OSRM', tollsStatus: 'unknown', knownTollsCost: 0, routeWarnings: result.warnings, weatherPoints: [], hasRainRisk: false };
}
export function withPlanningLimits(trip: TripPlan, limits: PlanningLimits) { return { ...trip, planningLimits: limits }; }


/**
 * Produz uma prévia navegável antes de iniciar uma viagem.
 * Não exibe uma linha reta como se fosse um percurso: a geometria precisa vir do OSRM.
 */
export async function prepareRoadPreview(draft: TripPlan, vehicle: Vehicle, signal?: AbortSignal): Promise<TripPlan> {
  const result = await calculateItinerary(draft, draft.manualStops || [], draft.acceptedSuggestions || [], signal);
  if (result.routePath.length < 2 || !Number.isFinite(result.distanceKm) || result.distanceKm <= 0
    || !Number.isFinite(result.durationMinutes) || result.durationMinutes <= 0) {
    throw new Error('Não foi possível encontrar um percurso rodoviário válido para esse destino.');
  }
  const trip = applyItinerary(draft, result);
  const consumption = vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage;
  return {
    ...trip,
    estimatedFuelLiters: consumption > 0 ? Number((trip.distanceKm / consumption).toFixed(2)) : 0
  };
}

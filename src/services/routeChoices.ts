import { fuelApi } from './fuelApi';
import { createRoadDraft } from './touristCircuit';
import type { NavigationManeuver, TripPlan, Vehicle } from '../types';

export interface VerifiedRouteChoice {
  id: string;
  kind: 'fast' | 'alternative' | 'tourist';
  distanceKm: number;
  durationMinutes: number;
  routePath: [number, number][];
  routeSteps: NavigationManeuver[];
  scenicStop?: { name: string; coords: [number, number] };
  trafficStatus: 'unavailable';
  tollStatus: 'unchecked';
}

export async function fetchRouteChoices(originCoords: [number, number], destinationCoords: [number, number], signal?: AbortSignal) {
  const data = await fuelApi<{ options: VerifiedRouteChoice[]; trafficDataAvailable: boolean }>('/routes/alternatives', {
    method: 'POST', signal, body: JSON.stringify({ originCoords, destinationCoords })
  });
  return data.options.filter(option => option.routePath?.length > 1 && option.distanceKm > 0);
}

export function choiceLabel(choice: VerifiedRouteChoice, index: number) {
  if (choice.kind === 'tourist') return 'Rota turística';
  if (choice.kind === 'fast') return 'Rota mais rápida';
  return `Rota alternativa ${index + 1}`;
}

export function choiceToTrip(choice: VerifiedRouteChoice, vehicle: Vehicle,
  originCoords: [number, number], destination: { name: string; coords: [number, number] }): TripPlan {
  const draft = createRoadDraft({
    originName: 'Sua localização atual', originCoords,
    destinationName: destination.name, destinationCoords: destination.coords,
    vehicle, circular: false, limits: { mode: 'destination' }
  });
  const consumption = vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage;
  const liters = consumption > 0 ? choice.distanceKm / consumption : 0;
  return {
    ...draft,
    modality: choice.kind === 'tourist' ? 'turistica' : 'rapida',
    distanceKm: choice.distanceKm, durationMinutes: choice.durationMinutes, drivingMinutes: choice.durationMinutes,
    routePath: choice.routePath, routeSteps: choice.routeSteps, routingSource: 'OSRM',
    waypointOrder: choice.scenicStop ? [originCoords,choice.scenicStop.coords,destination.coords] : [originCoords,destination.coords],
    stops: choice.scenicStop ? [{ id: `scenic-${choice.id}`, name: choice.scenicStop.name, category:'endereco',
      lat:choice.scenicStop.coords[0],lng:choice.scenicStop.coords[1],description:'Atração turística cadastrada',
      recommendedMinutes:0 }] : [],
    estimatedFuelLiters: Number(liters.toFixed(2)),
    tollsStatus: 'unknown',
    routeWarnings: ['Trânsito em tempo real indisponível. Pedágios ainda não verificados para esta alternativa.']
  };
}

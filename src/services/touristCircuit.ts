import { fuelApi } from './fuelApi';
import type { RouteStop, TripPlan, Vehicle } from '../types';
import type { PlanningLimits } from '../types/itinerary';

export interface TouristRequest {
  mode: 'km' | 'hours';
  target: number;
  tripType: 'round_trip' | 'one_way';
  interests: string[];
  originCoords: [number, number];
  originName: string;
  vehicle: Vehicle;
}

interface VerifiedTouristResult {
  title: string;
  destinationName: string;
  destinationCoords: [number, number];
  isCircular: boolean;
  distanceKm: number;
  durationMinutes: number;
  routePath: [number, number][];
  waypoints: [number, number][];
  stops: (RouteStop & { locationId: string })[];
  warnings: string[];
  routingSource: 'OSRM';
  tollsStatus: 'unknown';
}

export function createRoadDraft(options: {
  originName: string; originCoords: [number, number];
  destinationName: string; destinationCoords: [number, number];
  vehicle: Vehicle; circular: boolean; limits: PlanningLimits;
}): TripPlan {
  return {
    id: `trip-${crypto.randomUUID()}`,
    title: `Roteiro: ${options.originName} → ${options.destinationName}`,
    originName: options.originName,
    originCoords: options.originCoords,
    destinationName: options.destinationName,
    destinationCoords: options.destinationCoords,
    modality: 'rapida',
    returnModality: 'rapida',
    isCircular: options.circular,
    distanceKm: 0,
    durationMinutes: 0,
    vehicleId: options.vehicle.id,
    routePath: [],
    manualStops: [],
    stops: [],
    acceptedSuggestions: [],
    planningLimits: options.limits,
    weatherPoints: [],
    hasRainRisk: false,
    peopleCount: 1,
    vehicleGroupType: 'single_vehicle',
    groupVehiclesCount: 1,
    participants: [{ id: 'p-1', name: 'Você' }],
    splitExpenses: false,
    foodCostPerPerson: 0,
    fuelPricePerLiter: 0,
    estimatedFuelLiters: 0,
    estimatedFuelCost: 0,
    knownTollsCost: 0,
    totalFoodCost: 0,
    totalEstimatedCost: 0,
    costPerPerson: 0,
    status: 'planned',
    createdAt: new Date().toISOString()
  };
}

export async function generateVerifiedTouristCircuit(request: TouristRequest): Promise<TripPlan> {
  const result = await fuelApi<VerifiedTouristResult>('/routes/tourist', {
    method: 'POST',
    body: JSON.stringify({
      mode: request.mode,
      target: request.target,
      tripType: request.tripType,
      originCoords: request.originCoords,
      interests: request.interests
    })
  });
  if (!result.routePath?.length || !Array.isArray(result.stops) || result.routingSource !== 'OSRM') {
    throw new Error('O serviço não retornou um roteiro turístico rodoviário válido.');
  }
  const consumption = request.vehicle.consumption.userConfigured || request.vehicle.consumption.referenceAverage;
  const liters = consumption > 0 ? Number((result.distanceKm / consumption).toFixed(2)) : 0;
  return {
    ...createRoadDraft({
      originName: request.originName,
      originCoords: request.originCoords,
      destinationName: result.isCircular ? request.originName : result.destinationName,
      destinationCoords: result.destinationCoords,
      vehicle: request.vehicle,
      circular: result.isCircular,
      limits: { mode: request.mode, target: request.target }
    }),
    title: result.title,
    modality: 'turistica',
    distanceKm: result.distanceKm,
    durationMinutes: result.durationMinutes,
    routePath: result.routePath,
    waypointOrder: result.waypoints,
    routingSource: result.routingSource,
    tollsStatus: result.tollsStatus,
    routeWarnings: result.warnings,
    estimatedFuelLiters: liters,
    stops: result.stops.map(({ locationId, ...stop }) => stop),
    acceptedSuggestions: result.stops.map((stop, index) => ({
      id: `accepted-${index}-${stop.locationId}`,
      location: {
        id: stop.locationId, name: stop.name, coords: [stop.lat, stop.lng],
        address: stop.description, sourceUrl: stop.sourceUrl, category: stop.category
      },
      stayMinutes: stop.recommendedMinutes,
      afterIndex: -1
    }))
  };
}

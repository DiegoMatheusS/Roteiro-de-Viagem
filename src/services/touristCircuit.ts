import { fuelApi } from './fuelApi';
import type { RouteStop, TripPlan, Vehicle, NavigationManeuver } from '../types';
import type { PlanningLimits } from '../types/itinerary';

export interface TouristRequest {
  mode: 'km' | 'hours';
  target: number;
  tripType: 'round_trip' | 'one_way';
  interests: string[];
  originCoords: [number, number];
  originName: string;
  vehicle: Vehicle;
  /** Apenas pontos intermediários já apresentados, para evitar rota repetida. */
  avoidWaypoints?: [number, number][][];
}

interface VerifiedTouristResult {
  title: string;
  destinationName: string;
  destinationCoords: [number, number];
  isCircular: boolean;
  distanceKm: number;
  durationMinutes: number;
  routePath: [number, number][];
  routeSteps?: NavigationManeuver[];
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

interface AdjustedRoadResult {
  routePath: [number,number][];
  routeSteps: NavigationManeuver[];
  distanceKm:number;
  drivingMinutes:number;
  routingSource:'OSRM';
  stale:boolean;
}
/** The map handle changes an intermediate waypoint, never draws arbitrary lines. */
export async function recalculateDragRoute(trip:TripPlan,point:[number,number],vehicle:Vehicle):Promise<TripPlan> {
  const original=trip.waypointOrder?.length && trip.waypointOrder.length>=2
    ? trip.waypointOrder : [trip.originCoords,trip.destinationCoords];
  const stops=trip.editedWaypoint?original.slice(2):original.slice(1);
  const waypoints:[number,number][]=[trip.originCoords,point,...stops];
  if(waypoints.length>8)throw new Error('Muitos pontos no trajeto. Remova uma parada antes de ajustar a rota.');
  const next=await fuelApi<AdjustedRoadResult>('/routes/adjust',{
    method:'POST',body:JSON.stringify({waypoints})
  });
  if(next.routingSource!=='OSRM' || !Array.isArray(next.routePath) || next.routePath.length<2 ||
    !Number.isFinite(next.distanceKm)||!Number.isFinite(next.drivingMinutes))
    throw new Error('O roteador não confirmou uma rota rodoviária válida.');
  const consumption=vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage;
  const liters=consumption>0?Number((next.distanceKm/consumption).toFixed(2)):0;
  return {...trip,
    routePath:next.routePath,routeSteps:next.routeSteps,
    distanceKm:next.distanceKm,drivingMinutes:next.drivingMinutes,
    durationMinutes:next.drivingMinutes + trip.stops.reduce((n,s)=>n+(s.recommendedMinutes||0),0),
    waypointOrder:waypoints,editedWaypoint:point,routingSource:'OSRM',
    estimatedFuelLiters:liters,
    estimatedFuelCost:trip.fuelPricePerLiter>0?Number((liters*trip.fuelPricePerLiter).toFixed(2)):trip.estimatedFuelCost,
    routeWarnings:[
      ...(trip.routeWarnings||[]).filter(w=>!w.startsWith('O roteiro real tem ') &&
        !w.startsWith('O serviço de rotas está indisponível.')),
      ...(next.stale?['A rota foi recuperada do cache e pode estar desatualizada. Confira as condições antes de seguir.']:[])
    ]
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
      interests: request.interests,
      avoidWaypoints: request.avoidWaypoints || []
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
    routeSteps: result.routeSteps,
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

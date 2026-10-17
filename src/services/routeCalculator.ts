import { 
  TripPlan, 
  Vehicle, 
  RouteModality, 
  RouteStop, 
  WeatherPoint 
} from '../types';

export interface RouteOptionCalculated {
  modality: RouteModality;
  title: string;
  badge: string;
  description: string;
  distanceKm: number;
  durationMinutes: number;
  stopsCount: number;
  fuelLiters: number;
  fuelCost: number;
  tollsCost: number;
  totalFoodCost: number;
  totalCost: number;
  costPerPerson: number;
  scenicQualityStars: number;
  hasRainRisk: boolean;
  weatherSummary: string;
  routePath: [number, number][];
  stops: RouteStop[];
  weatherPoints: WeatherPoint[];
  capacityWarning?: string;
  explanation: string;
}

export interface RoutePlanningInput {
  originName: string;
  originCoords: [number, number];
  destinationName: string;
  destinationCoords: [number, number];
  vehicle: Vehicle;
  peopleCount: number;
  vehicleGroupType: 'single_vehicle' | 'multi_vehicle';
  groupVehiclesCount: number;
  splitExpenses: boolean;
  foodCostPerPerson: number;
  fuelPricePerLiter: number;
  returnModality: 'rapida' | 'turistica' | 'economica' | 'auto';
  isCircular?: boolean;
}

// Percursos e durações só podem vir do OSRM (server/maps.ts).
// Os geradores locais de rotas, paradas, pedágios e clima simulados foram removidos
// para impedir que dados fictícios sejam acidentalmente apresentados em produção.

export function getPlanningAlternatives(input: RoutePlanningInput, presetTrip?: TripPlan): RouteOptionCalculated[] {
  if (!presetTrip) throw new Error('Calcule um percurso rodoviário real antes de comparar custos.');
  const vehiclesCount = input.vehicleGroupType === 'multi_vehicle' ? Math.max(1, input.groupVehiclesCount) : 1;
  const consumption = input.vehicle.consumption.userConfigured || input.vehicle.consumption.referenceAverage || 15;
  const fuelLiters = Number((presetTrip.distanceKm / consumption * vehiclesCount).toFixed(2));
  const fuelCost = Number((presetTrip.distanceKm / consumption * vehiclesCount * input.fuelPricePerLiter).toFixed(2));
  const originalVehiclesCount = presetTrip.vehicleGroupType === 'multi_vehicle' ? Math.max(1,presetTrip.groupVehiclesCount) : 1;
  const tollsCost = Number((presetTrip.knownTollsCost / originalVehiclesCount * vehiclesCount).toFixed(2));
  const totalFoodCost = input.peopleCount * input.foodCostPerPerson;
  const totalCost = Number((fuelCost + tollsCost + totalFoodCost).toFixed(2));
  const capacityWarning = input.vehicleGroupType === 'single_vehicle' && input.peopleCount > input.vehicle.maxPassengers
    ? `O veículo comporta ${input.vehicle.maxPassengers} pessoas, mas o grupo possui ${input.peopleCount}.` : undefined;
  return [{
    modality: presetTrip.modality,
    title: presetTrip.title,
    badge: presetTrip.isCircular ? 'Ida e volta' : 'Só ida',
    description: 'Mantém a distância, o tempo e as paradas do passeio que você escolheu.',
    distanceKm: presetTrip.distanceKm,
    durationMinutes: presetTrip.durationMinutes,
    stopsCount: presetTrip.stops.length,
    fuelLiters, fuelCost, tollsCost, totalFoodCost, totalCost,
    costPerPerson: input.splitExpenses ? Number((totalCost / Math.max(1, input.peopleCount)).toFixed(2)) : totalCost,
    scenicQualityStars: presetTrip.routingSource === 'OSRM' ? 0 : 4,
    hasRainRisk: presetTrip.hasRainRisk,
    weatherSummary: presetTrip.weatherSource ? `Previsão real · ${presetTrip.weatherSource}` : 'Previsão indisponível; consulte novamente antes de sair.',
    routePath: presetTrip.routePath,
    stops: presetTrip.stops,
    weatherPoints: presetTrip.weatherPoints,
    capacityWarning,
    explanation: presetTrip.routingSource ? 'Percurso calculado por vias reais com paradas verificáveis. A distância e a duração podem variar da preferência inicial.' : 'Aguardando validação do traçado rodoviário.'
  }];
}

export function buildPlannedTrip(input: RoutePlanningInput, option: RouteOptionCalculated, presetTrip?: TripPlan): TripPlan {
  return {
    id: presetTrip?.id || `trip-${Date.now()}`,
    title: presetTrip?.title || `${option.title}: ${input.originName} até ${input.destinationName}`,
    originName: input.originName,
    originCoords: input.originCoords,
    destinationName: input.destinationName,
    destinationCoords: input.destinationCoords,
    modality: option.modality,
    returnModality: input.returnModality,
    isCircular: presetTrip?.isCircular ?? false,
    distanceKm: option.distanceKm,
    durationMinutes: option.durationMinutes,
    drivingMinutes: presetTrip?.drivingMinutes, tollsUpdatedAt: presetTrip?.tollsUpdatedAt, tollsMapUnavailable: presetTrip?.tollsMapUnavailable,
    vehicleId: input.vehicle.id,
    manualStops: presetTrip?.manualStops,
    acceptedSuggestions: presetTrip?.acceptedSuggestions,
    planningLimits: presetTrip?.planningLimits,
    waypointOrder: presetTrip?.waypointOrder,
    routingSource: presetTrip?.routingSource,
    tollsStatus: presetTrip?.tollsStatus,
    tolls: presetTrip?.tolls, weatherSource: presetTrip?.weatherSource, weatherUpdatedAt: presetTrip?.weatherUpdatedAt, departureAt: presetTrip?.departureAt,
    routeWarnings: presetTrip?.routeWarnings,
    routePath: option.routePath,
    routeSteps: presetTrip?.routeSteps,
    stops: option.stops,
    weatherPoints: option.weatherPoints,
    hasRainRisk: option.hasRainRisk,
    peopleCount: input.peopleCount,
    vehicleGroupType: input.vehicleGroupType,
    groupVehiclesCount: input.groupVehiclesCount,
    participants: Array.from({ length: input.peopleCount }, (_, i) => ({ id: `p-${i + 1}`, name: i === 0 ? 'Você' : `Participante ${i + 1}` })),
    splitExpenses: input.splitExpenses,
    foodCostPerPerson: input.foodCostPerPerson,
    fuelPricePerLiter: input.fuelPricePerLiter,
    estimatedFuelLiters: option.fuelLiters,
    estimatedFuelCost: option.fuelCost,
    knownTollsCost: option.tollsCost,
    totalFoodCost: option.totalFoodCost,
    totalEstimatedCost: option.totalCost,
    costPerPerson: option.costPerPerson,
    capacityWarning: option.capacityWarning,
    status: 'planned',
    createdAt: presetTrip?.createdAt || new Date().toISOString()
  };
}


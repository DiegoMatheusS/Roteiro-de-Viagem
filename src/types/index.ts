export type VehicleType = 'motorcycle' | 'car';

export type FuelType = 'gasolina' | 'etanol' | 'diesel' | 'flex' | 'eletrico';

export interface VehicleConsumption {
  referenceUrban: number;      // km/l
  referenceHighway: number;    // km/l
  referenceAverage: number;    // km/l
  source: string;              // e.g. "Inmetro PBEV 2024"
  sourceDate: string;          // e.g. "Janeiro/2024"
  observedAverage?: number;    // calculated from consecutive full tank refills
  userConfigured: number;      // effective value used for planning
}

export interface Vehicle {
  id: string;
  type: VehicleType;
  brand: string;
  model: string;
  year: number;
  version?: string;
  nickname: string;
  fuelType: FuelType;
  tankCapacityLiters: number;
  consumption: VehicleConsumption;
  maxPassengers: number; // e.g. 2 for moto, 5 for car
  photoUrl?: string;
  odometerKm: number;
  isDefault?: boolean;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  date: string;
  odometerKm: number;
  liters: number;
  pricePerLiter: number;
  totalAmount: number;
  fullTank: boolean;
  notes?: string;
}

export type TravelerTier = 'Bronze' | 'Prata' | 'Ouro' | 'Diamante';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
  progress: number;
  target: number;
  unit: string;
  category: 'distancia' | 'viagens' | 'turismo' | 'comunidade';
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
  canReceiveArrivalAlerts: boolean;
}

export interface TravelerProfile {
  id: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  homeAddress?: string;
  homeCoordinates?: [number, number]; // [lat, lng]
  isPublicProfile: boolean;
  showLevelPublicly: boolean;
  showMedalsPublicly: boolean;
  showKmPublicly: boolean;
  verifiedGpsKm: number;
  manualKm: number;
  completedTripsCount: number;
  savedRoutesCount: number;
  publishedRoutesCount: number;
  reviewsCount: number;
  emergencyContacts: EmergencyContact[];
}

export type RouteModality = 
  | 'rapida' 
  | 'turistica' 
  | 'panoramica' 
  | 'gastronomica' 
  | 'economica' 
  | 'equilibrada';

export interface RouteStop {
  id: string;
  name: string;
  category: 'mirante' | 'monumento' | 'restaurante' | 'posto' | 'hotel' | 'cidade_historica' | 'parque' | 'museu' | 'cidade' | 'endereco';
  lat: number;
  lng: number;
  description: string;
  recommendedMinutes: number;
  rating?: number;
  imageUrl?: string;
  estimatedArrivalHour?: string;
  type?: 'mandatory' | 'suggested';
  sourceUrl?: string;
}

export interface WeatherPoint {
  locationName: string;
  coords?: [number, number];
  forecastAt?: string;
  passTime: string; // e.g. "09:30"
  tempC: number;
  condition: 'Ensolarado' | 'Parcialmente Nublado' | 'Nublado' | 'Chuva Fraca' | 'Chuva Forte' | 'Neblina' | 'Neve' | 'Trovoada' | 'Chuva Congelante';
  rainProb: number; // 0 to 100
  windKmH: number;
  windDirectionDegrees?: number;
  warning?: string;
}

/** Manobra retornada pelo roteador rodoviário (nunca estimada pela interface). */
export interface NavigationManeuver {
  coords: [number, number];
  distanceFromStartKm: number;
  type: string;
  modifier?: string;
  name: string;
}

export interface TripPlan {
  id: string;
  title: string;
  originName: string;
  originCoords: [number, number];
  destinationName: string;
  destinationCoords: [number, number];
  modality: RouteModality;
  returnModality: 'rapida' | 'turistica' | 'economica' | 'auto';
  isCircular: boolean;
  distanceKm: number;
  durationMinutes: number;
  drivingMinutes?: number;
  tollsUpdatedAt?: string;
  tollsMapUnavailable?: boolean;
  vehicleId: string;
  routePath: [number, number][]; // coordinates for Leaflet polyline
  routeSteps?: NavigationManeuver[];
  /** Rota rodoviária restante após desvio, sem redefinir os km já percorridos. */
  navigationReroute?: import('../services/autoReroute').ReroutedNavigation;
  /** Paradas confirmadas pelo GPS nesta viagem, sem depender do servidor. */
  navigationVisitedStopIds?: string[];
  manualStops?: import('./itinerary').MandatoryStop[];
  acceptedSuggestions?: import('./itinerary').SuggestedStop[];
  planningLimits?: import('./itinerary').PlanningLimits;
  waypointOrder?: [number, number][];
  /** Ponto de ajuste manual do traçado na prévia, sem alterar a origem ou o destino. */
  editedWaypoint?: [number, number];
  routingSource?: 'OSRM';
  tollsStatus?: 'unknown' | 'partial' | 'available';
  tolls?: import('./tolls').RouteToll[];
  weatherSource?: string;
  weatherUpdatedAt?: string;
  departureAt?: string;
  startedAt?: string;
  endedAt?: string;
  trackedDistanceKm?: number;
  trackingDeviceId?: string;
  routeWarnings?: string[];
  stops: RouteStop[];
  weatherPoints: WeatherPoint[];
  hasRainRisk: boolean;
  // Group planning
  peopleCount: number;
  vehicleGroupType: 'single_vehicle' | 'multi_vehicle';
  groupVehiclesCount: number;
  participants: { id: string; name: string }[];
  splitExpenses: boolean;
  foodCostPerPerson: number;
  // Financial breakdown
  fuelPricePerLiter: number;
  fuelPriceSource?: import('./fuel').AppliedFuelPrice;
  estimatedFuelLiters: number;
  estimatedFuelCost: number;
  knownTollsCost: number;
  totalFoodCost: number;
  totalEstimatedCost: number;
  costPerPerson: number;
  capacityWarning?: string;
  // Execution status
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  actualDistanceKm?: number;
  actualTraveledVerifiedGps?: boolean;
  userRating?: number;
  userReview?: string;
}

export interface CommunityRoute {
  id: string;
  title: string;
  authorName: string;
  authorTier: TravelerTier;
  distanceKm: number;
  durationText: string;
  region: string;
  vehicleType: VehicleType;
  tags: string[];
  rating: number;
  reviewsCount: number;
  imageUrl: string;
  description: string;
  stopsCount: number;
  scenicHighlights: string[];
}

// ==========================================
// COMPARTILHAMENTO DE ROTA & COMBOIO DE VIAGEM
// ==========================================

export interface RouteSharePayload {
  shareId: string;
  tripTitle: string;
  originName: string;
  destinationName: string;
  distanceKm: number;
  durationMinutes: number;
  modality: RouteModality;
  stops: { name: string; category: string; description: string; type?: 'mandatory' | 'suggested'; stayMinutes?: number }[];
  scenicHighlights: string[];
  createdAt: string;
  shareableUrl: string;
}

export interface MeetingPoint {
  id: string;
  title: string;
  category: 'posto' | 'restaurante' | 'mirante' | 'estacionamento' | 'entrada_cidade' | 'minha_escolha';
  coords: [number, number]; // [lat, lng]
  description?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  order: number;
  confirmedArrivedParticipantIds: string[];
}

export interface ConvoyParticipant {
  id: string;
  name: string;
  vehicleType: VehicleType;
  vehicleNickname?: string;
  isOrganizer: boolean;
  isSharingLocation: boolean; // MUST BE FALSE BY DEFAULT (Requirement #3)
  coords?: [number, number]; // Only set if isSharingLocation === true
  lastLocationTimestamp?: string;
  isStale?: boolean; // if connection or timeout exceeds 3 mins
  distanceToMeetingPointKm?: number;
  joinedAt: string;
}

export interface ConvoySession {
  revision?: number;
  routeRevision?: number;
  ownLocationToken?: string;
  id: string;
  code: string; // e.g. "CONVOY-782"
  title: string;
  organizerId: string;
  tripId?: string;
  tripTitle: string;
  originName: string;
  destinationName: string;
  routePath: [number, number][];
  meetingPoints: MeetingPoint[];
  participants: ConvoyParticipant[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  notes?: string;
}


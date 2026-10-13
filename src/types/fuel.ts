export const FUEL_OPTIONS = [
  { id: 'gasolina_comum', label: 'Gasolina comum', unit: 'L' },
  { id: 'gasolina_aditivada', label: 'Gasolina aditivada', unit: 'L' },
  { id: 'etanol', label: 'Etanol', unit: 'L' },
  { id: 'diesel_comum', label: 'Diesel comum', unit: 'L' },
  { id: 'diesel_s10', label: 'Diesel S10', unit: 'L' },
  { id: 'gnv', label: 'GNV', unit: 'm³' },
  { id: 'eletrico', label: 'Recarga elétrica', unit: 'kWh' },
  { id: 'outro', label: 'Outro combustível', unit: 'L' }
] as const;

export type FuelKind = typeof FUEL_OPTIONS[number]['id'];
export type FuelUser = { id: string; displayName: string; role: 'user' | 'moderator' };
export type PriceDraft = { fuelType: FuelKind; price: number; customLabel?: string };
export interface FuelPrice extends PriceDraft {
  id: string;
  observedAt: string;
  publishedAt: string;
  source: 'manual' | 'photo';
  photoId?: string;
  confirmations: number;
  contests: number;
  reliabilityScore: number;
  reliability: 'Alta' | 'Média' | 'Baixa';
  stale: boolean;
  disputed: boolean;
  myVote?: 'confirm' | 'contest';
  isMine?: boolean;
}
export interface FuelStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  source: 'OpenStreetMap';
  sourceUrl: string;
  mapUpdatedAt: string;
  openingHours?: string;
  openingHoursVerifiedAt?: string;
  prices: FuelPrice[];
}
export interface FuelComparison {
  station: FuelStation;
  contribution: FuelPrice;
  distanceToStationKm: number;
  detourKm: number;
  extraFuelCost: number;
  purchaseCost: number;
  totalCost: number;
  reachable: boolean;
  openingStatus?: 'open' | 'closed' | 'unknown' | 'unverified';
  estimatedArrivalAt?: string;
}
export interface FuelComparisonResult {
  results: FuelComparison[];
  stationsWithNoFreshPrice: number;
  routingUnavailable: number;
  estimatedRangeKm: number;
  baselineDistanceKm?: number;
  source: string;
  additionalCandidates?: number;
}

export interface AppliedFuelPrice {
  stationId: string;
  stationName: string;
  contributionId: string;
  observedAt: string;
  fuelType: FuelKind;
  price: number;
  consumptionKmPerLiter: number;
}

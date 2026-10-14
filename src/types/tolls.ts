export interface RouteToll {
  id: string; name: string; coords: [number, number]; sourceUrl: string;
  passages: number;
  knownCost?: number;
  missingPassages?: number;
  tariffs?: { price: number | null; headingDegrees: number; priceId?: string; observedAt?: string; validUntil?: string }[];
  price: number | null;
  priceId?: string;
  observedAt?: string;
  validUntil?: string;
  headingDegrees?: number | null;
}

export interface RouteToll {
  id: string; name: string; coords: [number, number]; sourceUrl: string;
  passages: number;
  price: number | null;
  priceId?: string;
  observedAt?: string;
  validUntil?: string;
  headingDegrees?: number | null;
}

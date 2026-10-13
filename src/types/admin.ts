export const PLACE_KINDS = [
  { id: 'fuel', label: 'Posto', icon: '⛽' },
  { id: 'restaurant', label: 'Restaurante', icon: '🍽️' },
  { id: 'cafe', label: 'Café', icon: '☕' },
  { id: 'hotel', label: 'Hospedagem', icon: '🏨' },
  { id: 'viewpoint', label: 'Mirante', icon: '🌄' },
  { id: 'park', label: 'Parque', icon: '🌳' },
  { id: 'museum', label: 'Museu', icon: '🏛️' },
  { id: 'other', label: 'Outro estabelecimento', icon: '📍' }
] as const;
export interface Place {
  id: string; name: string; kind: typeof PLACE_KINDS[number]['id']; lat: number; lng: number;
  address: string; sourceUrl: string; description: string; website: string; phone: string;
  active: boolean; openingHours?: string;
}
export interface PlaceComment {
  id: string; body: string; displayName: string; createdAt: string; status: string;
  placeId?: string; placeName?: string;
}
export interface PriceHistory {
  id: string; fuelType: string; customLabel?: string; price: number; observedAt: string;
  publishedAt?: string; status: string; contributor: string; reviewer?: string;
}
export interface ReviewPhoto {
  id: string; stationId: string; stationName: string; address: string; createdAt: string;
  observedAt: string; contributor: string; status: string; history: PriceHistory[];
}
export interface PendingPrice extends PriceHistory { stationId: string; stationName: string; address: string; photoId?: string }
export interface AdminUser {
  id: string; displayName: string; email: string; role: string; createdAt: string; blockedAt?: string;
}
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

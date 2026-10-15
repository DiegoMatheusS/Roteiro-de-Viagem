export const PLACE_KINDS = [
  { id: 'fuel', label: 'Posto de combustível', icon: '⛽' },
  { id: 'restaurant', label: 'Restaurante', icon: '🍽️' },
  { id: 'cafe', label: 'Cafeteria', icon: '☕' },
  { id: 'market', label: 'Mercado / supermercado', icon: '🛒' },
  { id: 'shopping', label: 'Shopping / centro comercial', icon: '🏬' },
  { id: 'hotel', label: 'Hotel', icon: '🏨' },
  { id: 'inn', label: 'Pousada / hospedaria', icon: '🛏️' },
  { id: 'waterfall', label: 'Cachoeira', icon: '💧' },
  { id: 'viewpoint', label: 'Mirante', icon: '🌄' },
  { id: 'park', label: 'Parque / área natural', icon: '🌳' },
  { id: 'museum', label: 'Museu', icon: '🏛️' },
  { id: 'other', label: 'Outro ponto de interesse', icon: '📍' }
] as const;
export type PlaceKind = typeof PLACE_KINDS[number]['id'];
export interface Place {
  id: string; name: string; kind: PlaceKind; lat: number; lng: number;
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

export type ExploreCoords = [number, number];
export type ExploreFilter = 'all' | 'near' | 'nature' | 'culture' | 'road' | 'cities' | 'waterfalls' | 'lakes' | 'parks';
export type ExploreArea = 'all' | 'metropolitan' | 'inland' | 'coast';

export interface ExplorePlace {
  id: string;
  name: string;
  aliases?: string[];
  coords: ExploreCoords;
  kind: string;
  address: string;
  category: string;
  city: string;
  photo?: string;
  photoCredit?: string;
  photoPage?: string;
  photoLicense?: string;
  sourceUrl?: string;
  coordinateSource?: string;
  curated?: boolean;
}

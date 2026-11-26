type Coordinates = [number, number];

export interface PoliceRoute {
  station: { name: string; coords: Coordinates };
  routePath: Coordinates[];
  distanceKm: number;
}

export const POLICE_ROUTE_BLUE = '#1d4ed8';
export const POLICE_ROUTE_RED = '#dc2626';

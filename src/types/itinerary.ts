export interface LocationSelection {
  id?: string; name: string; address?: string; coords?: [number, number]; sourceUrl?: string; category?: string;
}
export interface MandatoryStop { id: string; location: LocationSelection; stayMinutes: number }
export interface SuggestedStop { id: string; location: LocationSelection; stayMinutes: number; afterIndex: number }
export interface PlanningLimits { mode: 'km' | 'hours' | 'destination'; target?: number }
export interface ItineraryResult {
  distanceKm: number; drivingMinutes: number; durationMinutes: number; routePath: [number, number][];
  routeSteps?: import('./index').NavigationManeuver[];
  waypoints: [number, number][]; manualStops: MandatoryStop[]; acceptedSuggestions: SuggestedStop[];
  suggestions: SuggestedStop[]; warnings: string[]; exceedsLimit: boolean; tollsStatus: 'unknown';
}
export const sampleRoutePath = (points: [number, number][], max = 25): [number, number][] => points.length <= max ? points :
  Array.from({ length: max }, (_, index) => points[Math.round(index * (points.length - 1) / (max - 1))]);

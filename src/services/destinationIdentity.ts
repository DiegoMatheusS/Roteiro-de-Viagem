import type { LocationSelection } from '../types/itinerary';

/** Remount destination planning whenever its actual coordinates change.
 * Different locations can share a name (or even an OSM identifier alias).
 */
export function destinationExploreKey(target: LocationSelection): string {
  return JSON.stringify([target.id ?? '', target.name, target.coords?.[0], target.coords?.[1]]);
}

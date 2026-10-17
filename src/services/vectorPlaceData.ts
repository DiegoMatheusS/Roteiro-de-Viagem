import type { Place } from '../types/admin';
import { TOURIST_PLACE_KINDS } from '../types/admin';
import type { FuelStation } from '../types/fuel';
import type { RouteToll } from '../types/tolls';
import { fuelPriceLabel, tollPriceLabel } from './mapPriceLabels';

export type RoleVectorMarker =
  | { kind:'fuel'; id:string; coords:[number,number]; name:string; priceLabel:string|null }
  | { kind:'toll'; id:string; coords:[number,number]; name:string; priceLabel:string|null; place:Place|null }
  | { kind:'place'; id:string; coords:[number,number]; name:string; category:Place['kind'] };

export function validMarkerPosition(position: [number, number]): boolean {
  return position.length === 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
    && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
}
export function toMarkerLngLat([lat,lon]:[number,number]): [number,number] {
  return [lon,lat];
}

/**
 * A single source for Leaflet fallback / MapLibre content. Markers originate
 * only from real API entities and route-scoped confirmed tariffs.
 */
export function selectRoleVectorMarkers(options: {
  stations: FuelStation[];
  places: Place[];
  tolls: RouteToll[];
  navigationMode: boolean;
  tollVehicleType?: 'car'|'motorcycle';
}): RoleVectorMarker[] {
  const entries: RoleVectorMarker[] = [];
  const ids = new Set<string>();
  const add = (entry: RoleVectorMarker) => {
    if (validMarkerPosition(entry.coords) && !ids.has(entry.id)) {
      ids.add(entry.id);
      entries.push(entry);
    }
  };
  if (!options.navigationMode) {
    for (const station of options.stations) {
      add({ kind:'fuel',id:station.id,coords:[station.lat,station.lng],
        name:station.name,priceLabel:fuelPriceLabel(station) });
    }
    if (options.tollVehicleType) {
      for (const toll of options.tolls) {
        add({kind:'toll',id:toll.id,coords:toll.coords,
          name:toll.name,priceLabel:tollPriceLabel(toll),place:null});
      }
    }
  }
  const knownTollIds = new Set(options.tolls.map(toll=>toll.id));
  for (const place of options.places) {
    if (options.navigationMode && !(TOURIST_PLACE_KINDS as readonly string[]).includes(place.kind)) continue;
    const coords: [number,number] = [place.lat,place.lng];
    if (place.kind === 'toll') {
      if (!options.navigationMode && !knownTollIds.has(place.id)) {
        add({kind:'toll',id:place.id,coords,name:place.name,priceLabel:null,place});
      }
    } else {
      add({kind:'place',id:place.id,coords,name:place.name,category:place.kind});
    }
  }
  return entries;
}

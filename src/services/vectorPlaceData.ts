import type { Place } from '../types/admin';
import type { FuelStation } from '../types/fuel';
import type { RouteToll } from '../types/tolls';
import { fuelPriceLabel, tollPriceLabel } from './mapPriceLabels';
import { distanceBetweenKm } from './gpsTracking';

export type RoleVectorMarker =
  | { kind:'fuel'; id:string; coords:[number,number]; name:string; priceLabel:string|null;managed?:boolean }
  | { kind:'toll'; id:string; coords:[number,number]; name:string; priceLabel:string|null; place:Place|null;managed?:boolean }
  | { kind:'place'; id:string; coords:[number,number]; name:string; category:Place['kind']; description?:string; managed?:boolean };

/** Stable identity and visual metadata used by the incremental vector renderer.
 * Moving a place should only call Marker.setLngLat, never recreate its buttons.
 */
export function rolePlaceMarkerKey(entry: RoleVectorMarker): string {
  return `${entry.kind}:${entry.id}`;
}
export function rolePlaceMarkerSignature(entry: RoleVectorMarker): string {
  // Only the category glyph and accessible name are drawn on the pin.
  // Price/description refreshes belong to the sheet and must not replace it.
  return JSON.stringify([entry.kind,entry.name,entry.kind==='place'?entry.category:entry.kind]);
}

export function validMarkerPosition(position: [number, number]): boolean {
  return position.length === 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
    && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
}
export function toMarkerLngLat([lat,lon]:[number,number]): [number,number] {
  return [lon,lat];
}

/** Route tariffs already combine the lane nodes of a plaza within 200 m.
 * Keep that same plaza as one marker instead of adding an unpriced lane. */
export function isRouteTollPlace(place:Place,tolls:readonly RouteToll[]):boolean {
  return place.kind==='toll'&&tolls.some(toll=>toll.id===place.id||
    distanceBetweenKm(toll.coords,[place.lat,place.lng])<0.2);
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
  viewportScopedPlaces?:boolean;
}): RoleVectorMarker[] {
  const entries: RoleVectorMarker[] = [];
  const freshFuelPlaces=new Map(options.places.filter(place=>place.active&&place.kind==='fuel').map(place=>[place.id,place]));
  const ids = new Set<string>();
  const add = (entry: RoleVectorMarker) => {
    if (validMarkerPosition(entry.coords) && !ids.has(entry.id)) {
      ids.add(entry.id);
      entries.push(entry);
    }
  };
  {
    for (const source of options.stations) {
      const fresh=freshFuelPlaces.get(source.id);
      if(options.viewportScopedPlaces&&source.managed&&!fresh)continue;
      const station=fresh?{...source,name:fresh.name,lat:fresh.lat,lng:fresh.lng,managed:fresh.managed}:source;
      add({ kind:'fuel',id:station.id,coords:[station.lat,station.lng],
        name:station.name,priceLabel:fuelPriceLabel(station),managed:station.managed });
    }
    if (options.tollVehicleType) {
      for (const toll of options.tolls) {
        add({kind:'toll',id:toll.id,coords:toll.coords,
          name:toll.name,priceLabel:tollPriceLabel(toll),place:null});
      }
    }
  }
  for (const place of options.places) {
    if(!place.active)continue;
    // Navigation uses zoom/proximity filtering instead of hiding registered POIs entirely.
    const coords: [number,number] = [place.lat,place.lng];
    if(place.kind==='fuel'){
      add({kind:'fuel',id:place.id,coords,name:place.name,priceLabel:null,managed:place.managed});
    }else if (place.kind === 'toll') {
      if (!isRouteTollPlace(place,options.tolls)) {
        add({kind:'toll',id:place.id,coords,name:place.name,priceLabel:null,place,managed:place.managed});
      }
    } else {
      add({kind:'place',id:place.id,coords,name:place.name,category:place.kind,description:place.description,managed:place.managed});
    }
  }
  return entries;
}

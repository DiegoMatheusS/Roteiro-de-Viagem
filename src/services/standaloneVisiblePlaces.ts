import type {MapVisiblePlace} from '../components/InteractiveMap';
import type {RoleVectorMarker} from './vectorPlaceData';
import type {Place} from '../types/admin';
import type {FuelStation} from '../types/fuel';
import type {RouteStop} from '../types';
import {selectTripStops,positionValid} from './vectorTripPinData';
import {distanceMeters} from './roadSpeedLimit';

/** Use exactly the descriptors installed by the native marker controller.
 * No provider result is published unless its marker is within the viewport. */
export function standaloneVisiblePlaces(input:{
  markers:readonly RoleVectorMarker[];stations:readonly FuelStation[];places:readonly Place[];
  stops:readonly RouteStop[];center:[number,number];contains:(coords:[number,number])=>boolean;
}):MapVisiblePlace[]{
  const addresses=new Map([...input.stations,...input.places].map(place=>[place.id,place.address]));
  const all:MapVisiblePlace[]=[
    ...input.markers.map(marker=>({id:marker.id,name:marker.name,
      kind:marker.kind==='place'?marker.category:marker.kind,address:addresses.get(marker.id)||'',coords:marker.coords})),
    ...selectTripStops(input.stops).map(stop=>({id:'stop:'+stop.name+':'+stop.lat+':'+stop.lng,
      name:stop.name,kind:stop.category,address:stop.description,coords:[stop.lat,stop.lng] as [number,number]}))
  ];
  const unique=new Map<string,MapVisiblePlace>();
  for(const place of all){
    if(!positionValid(place.coords)||!input.contains(place.coords))continue;
    const key=place.coords.map(value=>value.toFixed(5)).join(',')+':'+place.name.toLowerCase();
    if(!unique.has(key))unique.set(key,place);
  }
  return [...unique.values()].sort((a,b)=>distanceMeters(a.coords,input.center)-distanceMeters(b.coords,input.center)).slice(0,25);
}

import type {MapVisiblePlace} from '../components/InteractiveMap';
import type {RoleVectorMarker} from './vectorPlaceData';
import type {Place} from '../types/admin';
import type {FuelStation} from '../types/fuel';
import type {RouteStop} from '../types';
import {selectTripStops,positionValid} from './vectorTripPinData';
import {nearestVisiblePlaces} from './mapPlaceViewport';
import {poiVisibleAtZoom} from './mapPoiPresentation';

/** Use exactly the descriptors installed by the native marker controller.
 * No provider result is published unless its marker is within the viewport. */
export function standaloneVisiblePlaces(input:{
  markers:readonly RoleVectorMarker[];stations:readonly FuelStation[];places:readonly Place[];
  stops:readonly RouteStop[];center:[number,number];contains:(coords:[number,number])=>boolean;
  zoom?:number;showRouteServices?:boolean;
}):MapVisiblePlace[]{
  const addresses=new Map([...input.stations,...input.places].map(place=>[place.id,place.address]));
  const all:MapVisiblePlace[]=[
    ...input.markers.filter(marker=>input.zoom===undefined||poiVisibleAtZoom(marker,input.zoom)||
      (input.showRouteServices&&(marker.kind==='fuel'||marker.kind==='toll')))
      .map(marker=>({id:marker.id,name:marker.name,
      kind:marker.kind==='place'?marker.category:marker.kind,address:addresses.get(marker.id)||'',coords:marker.coords})),
    ...selectTripStops(input.stops).map(stop=>({id:'stop:'+stop.name+':'+stop.lat+':'+stop.lng,
      name:stop.name,kind:stop.category,address:stop.description,coords:[stop.lat,stop.lng] as [number,number]}))
  ];
  return nearestVisiblePlaces(all.filter(place=>positionValid(place.coords)),input.center,input.contains);
}

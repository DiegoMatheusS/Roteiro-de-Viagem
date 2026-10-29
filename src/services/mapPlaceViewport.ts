import type {MapVisiblePlace} from '../components/InteractiveMap';
import {distanceMeters} from './roadSpeedLimit';

export interface PlaceBounds {south:number;north:number;west:number;east:number}
export interface MapPlaceQuery {points:[number,number][];radiusKm:number;bounds:PlaceBounds}

/** Query a padded, stable area after camera movement, rather than all places
 * along an entire journey. Grid padding avoids a request on every GPS fix. */
export function mapPlaceViewport(bounds:PlaceBounds,zoom:number):MapPlaceQuery|null {
  const {south,north,west,east}=bounds;
  if(!Number.isFinite(zoom)||zoom<9||![south,north,west,east].every(Number.isFinite)||
    south>=north||Math.abs(south)>90||Math.abs(north)>90||
    Math.abs(west)>540||Math.abs(east)>540)return null;
  const width=west<=east?east-west:360-west+east;
  if(north-south>8||width<=0||width>8)return null;
  const grid=zoom>=17?.001:zoom>=14?.005:zoom>=11?.02:.1;
  const round=(value:number)=>Number(value.toFixed(6));
  const s=round(Math.max(-90,(Math.floor(south/grid)-1)*grid));
  const n=round(Math.min(90,(Math.ceil(north/grid)+1)*grid));
  const unwrapEast=east<west?east+360:east;
  const w=round((Math.floor(west/grid)-1)*grid);
  const e=round((Math.ceil(unwrapEast/grid)+1)*grid);
  const wrap=(value:number)=>round(((value+180)%360+360)%360-180);
  const center:[number,number]=[round((s+n)/2),wrap((w+e)/2)];
  const radiusKm=Math.min(120,Math.max(1,Math.ceil(distanceMeters(center,[n,wrap(e)])/1000)));
  return {points:[center],radiusKm,bounds:{south:s,north:n,west:wrap(w),east:wrap(e)}};
}

export function sameMapPlaceQuery(a:MapPlaceQuery|null,b:MapPlaceQuery|null):boolean {
  return a===b||JSON.stringify(a)===JSON.stringify(b);
}

/** Share the same bounded visible list between both map renderers. */
export function nearestVisiblePlaces(places:MapVisiblePlace[],center:[number,number],
  contains:(coords:[number,number])=>boolean):MapVisiblePlace[]{
  const unique=new Map<string,MapVisiblePlace>();
  for(const place of places){
    if(!Number.isFinite(place.coords[0])||!Number.isFinite(place.coords[1])||!contains(place.coords))continue;
    const key=place.coords.map(value=>value.toFixed(5)).join(',')+':'+place.name.toLowerCase();
    if(!unique.has(key))unique.set(key,place);
  }
  return [...unique.values()].sort((a,b)=>distanceMeters(a.coords,center)-distanceMeters(b.coords,center)).slice(0,25);
}

/** Preserve loaded places within the next camera query while a zoom/pan fetches.\n * An empty successful response replaces the stale values. */\nexport function retainedPlacesWithinBounds<T extends {lat:number;lng:number;active?:boolean}>(\n  places:readonly T[],bounds?:PlaceBounds\n):T[]{\n  if(!bounds)return [];\n  const {south,north,west,east}=bounds;\n  return places.filter(place=>place.active!==false&&Number.isFinite(place.lat)&&Number.isFinite(place.lng)&&\n    place.lat>=south&&place.lat<=north&&(west<=east\n      ?place.lng>=west&&place.lng<=east\n      :place.lng>=west||place.lng<=east));\n}\n
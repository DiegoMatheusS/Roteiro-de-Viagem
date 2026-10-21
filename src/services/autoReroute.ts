import type { DeviceLocation } from './locationService';
import type { NavigationManeuver, TripPlan } from '../types';
import { isFreshGpsFix } from './gpsFreshness';
import { distanceBetweenKm } from './gpsTracking';
import { fuelApi } from './fuelApi';

type Coordinates=[number,number];

export const OFF_ROUTE_MIN_FIXES=3;
export const OFF_ROUTE_CONFIRM_MS=6000;
export const REROUTE_COOLDOWN_MS=60000;

export interface ReroutedNavigation {
  originCoords:Coordinates;
  routePath:Coordinates[];
  routeSteps:NavigationManeuver[];
  distanceKm:number;
  drivingMinutes:number;
  trackedAtKm:number;
  updatedAt:string;
}
export interface OffRouteState {
  lastTimestamp:number;
  previousCoords:Coordinates|null;
  outsideSince:number|null;
  outsideCount:number;
  firstOutside:Coordinates|null;
  lastAttemptAt:number;
}
export const initialOffRouteState=():OffRouteState=>({
  lastTimestamp:0,previousCoords:null,outsideSince:null,outsideCount:0,
  firstOutside:null,lastAttemptAt:0
});
const coordsValid=(coords:unknown):coords is Coordinates=>
  Array.isArray(coords)&&coords.length===2&&coords.every(Number.isFinite)&&
  Math.abs(coords[0])<=90&&Math.abs(coords[1])<=180;

export function eligibleDirectReroute(trip:TripPlan):boolean {
  return trip.routingSource==='OSRM' && trip.routePath.length>=2 &&
    coordsValid(trip.destinationCoords) &&
    (!trip.waypointOrder||trip.waypointOrder.length<=2) &&
    !trip.editedWaypoint && trip.stops.length===0 &&
    (trip.manualStops?.length||0)===0 &&
    (trip.acceptedSuggestions?.length||0)===0;
}

/** True minimum to every *road segment*, not the nearest route vertex:
 * sparse geometry on a long highway must not cause false recalculation. */
export function distanceToRouteMeters(point:Coordinates,path:readonly Coordinates[]):number {
  if(!coordsValid(point)||path.length<2)return Infinity;
  const latScale=111195,lonScale=latScale*Math.max(0.1,Math.cos(point[0]*Math.PI/180));
  let closest=Infinity;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(!coordsValid(a)||!coordsValid(b))continue;
    const ax=(a[1]-point[1])*lonScale,ay=(a[0]-point[0])*latScale;
    const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*latScale;
    const length=dx*dx+dy*dy;
    const t=length>0?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
    closest=Math.min(closest,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return closest;
}

export function evaluateOffRoute(
  state:OffRouteState,fix:DeviceLocation,path:readonly Coordinates[],now=Date.now()
):{state:OffRouteState;trigger:boolean;distanceMeters:number|null}{
  if(!coordsValid(fix.coords)||!isFreshGpsFix(fix.timestamp,now) ||
     !Number.isFinite(fix.accuracyMeters)||fix.accuracyMeters<0||fix.accuracyMeters>40 ||
     !Number.isFinite(fix.timestamp)||path.length<2){
    return {state:{...state,outsideSince:null,outsideCount:0,firstOutside:null},
      trigger:false,distanceMeters:null};
  }
  if(fix.timestamp<=state.lastTimestamp)
    return {state,trigger:false,distanceMeters:null};
  const seconds=state.lastTimestamp?(fix.timestamp-state.lastTimestamp)/1000:0;
  const jump=state.previousCoords?distanceBetweenKm(state.previousCoords,fix.coords)*1000:0;
  const base={...state,lastTimestamp:fix.timestamp,previousCoords:fix.coords};
  // Ignore jumps / reacquired signal, not just inaccurate points.
  if((seconds>0&&seconds<=15&&jump/seconds>55) || (state.lastTimestamp&&seconds>15))
    return {state:{...base,outsideSince:null,outsideCount:0,firstOutside:null},
      trigger:false,distanceMeters:null};
  const distance=distanceToRouteMeters(fix.coords,path);
  const tolerance=Math.min(140,Math.max(75,fix.accuracyMeters*2+40));
  if(distance<=tolerance || !Number.isFinite(distance))
    return {state:{...base,outsideSince:null,outsideCount:0,firstOutside:null},
      trigger:false,distanceMeters:distance};
  const since=state.outsideSince??fix.timestamp;
  const count=(state.outsideSince===null?0:state.outsideCount)+1;
  const first=state.firstOutside??fix.coords;
  const displaced=distanceBetweenKm(first,fix.coords)*1000;
  const confirmed=count>=OFF_ROUTE_MIN_FIXES && fix.timestamp-since>=OFF_ROUTE_CONFIRM_MS &&
    displaced>=25 && (fix.speedMetersPerSecond===null || fix.speedMetersPerSecond>=1.4);
  const cooldown=now-state.lastAttemptAt>=REROUTE_COOLDOWN_MS;
  return {state:{...base,outsideSince:confirmed&&cooldown?null:since,
      outsideCount:confirmed&&cooldown?0:count,
      firstOutside:confirmed&&cooldown?null:first,
      lastAttemptAt:confirmed&&cooldown?now:state.lastAttemptAt},
    trigger:confirmed&&cooldown,distanceMeters:distance};
}

interface VerifiedItineraryResponse {
  routePath:Coordinates[];
  routeSteps?:NavigationManeuver[];
  distanceKm:number;
  drivingMinutes:number;
  durationMinutes:number;
  stale?:boolean;
}
export function verifiedReroute(
  result:VerifiedItineraryResponse,origin:Coordinates,destination:Coordinates,
  trackedAtKm:number,now=new Date()
):ReroutedNavigation{
  if(!result || !Array.isArray(result.routePath) || result.routePath.length<2 ||
    result.routePath.length>8000 || !result.routePath.every(coordsValid) ||
    !Array.isArray(result.routeSteps) || !result.routeSteps.length ||
    !Number.isFinite(result.distanceKm) || result.distanceKm<=0 ||
    !Number.isFinite(result.drivingMinutes) || result.drivingMinutes<=0 ||
    result.stale===true ||
    distanceBetweenKm(result.routePath[0],origin)>.35 ||
    distanceBetweenKm(result.routePath[result.routePath.length-1],destination)>.35)
    throw new Error('O roteador não confirmou um novo percurso rodoviário válido.');
  if(!Number.isFinite(trackedAtKm)||trackedAtKm<0)
    throw new Error('Distância do GPS inválida para atualizar a rota.');
  return {originCoords:origin,routePath:result.routePath,routeSteps:result.routeSteps,
    distanceKm:result.distanceKm,drivingMinutes:result.drivingMinutes,
    trackedAtKm,updatedAt:now.toISOString()};
}

/** Calls the already-existing itinerary API, not an external OSRM URL.
 * No server changes and no straight lines when routing is unreachable. */
export async function requestAutomaticReroute(trip:TripPlan,origin:Coordinates,
  trackedAtKm:number,signal?:AbortSignal):Promise<ReroutedNavigation>{
  if(!eligibleDirectReroute(trip)||!coordsValid(origin))
    throw new Error('Este roteiro possui paradas; a rota original será preservada.');
  const response=await fuelApi<VerifiedItineraryResponse>('/routes/itinerary',{
    method:'POST',signal,body:JSON.stringify({
      originCoords:origin,destinationCoords:trip.destinationCoords,roundTrip:false,
      manualStops:[],acceptedSuggestions:[],limits:{mode:'destination'}
    })
  });
  return verifiedReroute(response,origin,trip.destinationCoords,trackedAtKm);
}

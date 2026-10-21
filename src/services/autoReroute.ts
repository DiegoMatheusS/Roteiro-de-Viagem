import type { DeviceLocation } from './locationService';
import type { NavigationManeuver, TripPlan } from '../types';
import type { MandatoryStop } from '../types/itinerary';
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
  /** Every outstanding stop the router confirmed in the new trip geometry. */
  remainingStopIds?:string[];
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
  return trip.routingSource==='OSRM' && !trip.isCircular && trip.routePath.length>=2 &&
    coordsValid(trip.destinationCoords) &&
    (!trip.waypointOrder||trip.waypointOrder.length<=2) &&
    !trip.editedWaypoint && trip.stops.length===0 &&
    (trip.manualStops?.length||0)===0 &&
    (trip.acceptedSuggestions?.length||0)===0;
}


/** A route is never silently changed into a shortcut to the destination.
 * Preserve verified, ordered stops; any incomplete/ambiguous stop data is a
 * reason to keep the original path rather than guess. */
export const MAX_AUTOMATIC_STOPS=6;
export function orderedRerouteStops(trip:TripPlan):MandatoryStop[]|null {
  const mandatory=trip.manualStops||[];
  const suggested=trip.acceptedSuggestions||[];
  const total=mandatory.length+suggested.length;
  if(total===0)return trip.stops.length===0 ? [] : null;
  if(total>MAX_AUTOMATIC_STOPS || mandatory.length>12 ||
     suggested.length>8 || trip.editedWaypoint || trip.isCircular)return null;
  const ordered:MandatoryStop[]=[];
  const add=(stop:MandatoryStop)=>{
    if(!stop||typeof stop.id!=='string'||stop.id.length<1||stop.id.length>80||
       !stop.location||typeof stop.location.id!=='string'||
       !stop.location.id||!coordsValid(stop.location.coords)||
       !Number.isInteger(stop.stayMinutes)||stop.stayMinutes<0||
       stop.stayMinutes>1440)return false;
    ordered.push({id:stop.id,location:stop.location,stayMinutes:stop.stayMinutes});
    return true;
  };
  const before=suggested.filter(stop=>stop.afterIndex===-1);
  if(before.some(stop=>!add(stop)))return null;
  for(let i=0;i<mandatory.length;i++){
    if(!add(mandatory[i]))return null;
    if(suggested.filter(stop=>stop.afterIndex===i).some(stop=>!add(stop)))return null;
  }
  if(!mandatory.length&&suggested.filter(stop=>stop.afterIndex===0).some(stop=>!add(stop)))return null;
  if(ordered.length!==total || new Set(ordered.map(stop=>stop.id)).size!==total ||
     trip.stops.length!==total ||
     trip.stops.some((stop,index)=>stop.id!==ordered[index].id))return null;
  // The route may have been manually reshaped independently of the itinerary.
  if(trip.waypointOrder?.length && trip.waypointOrder.length!==total+2)return null;
  return ordered;
}
export function remainingRerouteStops(trip:TripPlan):MandatoryStop[]|null {
  const ordered=orderedRerouteStops(trip);
  if(!ordered)return null;
  const visited=new Set(trip.navigationVisitedStopIds||[]);
  return ordered.filter(stop=>!visited.has(stop.id));
}
export function eligibleAutomaticReroute(trip:TripPlan):boolean {
  if(trip.routingSource!=='OSRM'||trip.isCircular||trip.editedWaypoint||
     trip.routePath.length<2||!coordsValid(trip.destinationCoords))return false;
  const stops=orderedRerouteStops(trip);
  return stops!==null && (!stops.length
    ?(!trip.waypointOrder||trip.waypointOrder.length<=2)
    :true);
}
/** Two or more GPS fixes near the NEXT stop, across at least four seconds,
 * are required before it can be excluded from a later recalculation. */
export interface StopArrivalState {
  candidateId:string|null;sinceMs:number;count:number;lastTimestamp:number;
}
export const initialStopArrivalState=():StopArrivalState=>({
  candidateId:null,sinceMs:0,count:0,lastTimestamp:0
});
export function confirmStopArrival(state:StopArrivalState,trip:TripPlan,
  fix:DeviceLocation|null,now=Date.now()
):{state:StopArrivalState;visitedId:string|null}{
  const remaining=remainingRerouteStops(trip);
  const next=remaining?.[0];
  if(!next||!fix||!isFreshGpsFix(fix.timestamp,now)||
    !coordsValid(fix.coords)||!Number.isFinite(fix.accuracyMeters)||
    fix.accuracyMeters<0||fix.accuracyMeters>25 ||
    (fix.speedMetersPerSecond!==null && fix.speedMetersPerSecond>10)||
    distanceBetweenKm(fix.coords,next.location.coords!)*1000>50){
    return {state:initialStopArrivalState(),visitedId:null};
  }
  if(fix.timestamp<=state.lastTimestamp)
    return {state,visitedId:null};
  const same=state.candidateId===next.id;
  const sinceMs=same?state.sinceMs:fix.timestamp;
  const count=same?state.count+1:1;
  const updated={candidateId:next.id,sinceMs,count,lastTimestamp:fix.timestamp};
  if(count>=3 && fix.timestamp-sinceMs>=4000)
    return {state:initialStopArrivalState(),visitedId:next.id};
  return {state:updated,visitedId:null};
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

export function isGpsOutsideRouteCorridor(fix:DeviceLocation|null,
  path:readonly Coordinates[],now=Date.now()):boolean{
  if(!fix||!coordsValid(fix.coords)||!isFreshGpsFix(fix.timestamp,now)||
     !Number.isFinite(fix.accuracyMeters)||fix.accuracyMeters<0||
     fix.accuracyMeters>40)return false;
  const tolerance=Math.min(140,Math.max(75,fix.accuracyMeters*2+40));
  return distanceToRouteMeters(fix.coords,path)>tolerance;
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
  if(!isGpsOutsideRouteCorridor(fix,path,now) || !Number.isFinite(distance))
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
  warnings?:string[];
  waypoints?:Coordinates[];
}
export function verifiedReroute(
  result:VerifiedItineraryResponse,origin:Coordinates,destination:Coordinates,
  trackedAtKm:number,now=new Date(),expectedWaypoints?:Coordinates[]
):ReroutedNavigation{
  if(!result || !Array.isArray(result.routePath) || result.routePath.length<2 ||
    result.routePath.length>8000 || !result.routePath.every(coordsValid) ||
    result.routePath.some((point,i)=>i>0&&distanceBetweenKm(result.routePath[i-1],point)>100) ||
    !Array.isArray(result.routeSteps) || !result.routeSteps.length ||
    !Number.isFinite(result.distanceKm) || result.distanceKm<=0 ||
    !Number.isFinite(result.drivingMinutes) || result.drivingMinutes<=0 ||
    result.stale===true ||
    result.warnings?.some(w=>typeof w==='string'&&
      /rota recuperada do histórico|percurso pode estar desatualizado/i.test(w)) ||
    distanceBetweenKm(result.routePath[0],origin)>.35 ||
    distanceBetweenKm(result.routePath[result.routePath.length-1],destination)>.35 ||
    (expectedWaypoints!==undefined &&
      (!Array.isArray(result.waypoints) ||
        result.waypoints.length!==expectedWaypoints.length ||
        result.waypoints.some((point,i)=>!coordsValid(point)||
          distanceBetweenKm(point,expectedWaypoints[i])>.08) ||
        expectedWaypoints.slice(1,-1).some(point=>distanceToRouteMeters(point,result.routePath)>160))))
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
  if(!eligibleAutomaticReroute(trip)||!coordsValid(origin))
    throw new Error('As paradas não puderam ser verificadas; a rota original será preservada.');
  const remaining=remainingRerouteStops(trip);
  if(!remaining)throw new Error('As paradas do roteiro estão incompletas.');
  const expectedWaypoints:Coordinates[]=[
    origin,...remaining.map(stop=>stop.location.coords!),trip.destinationCoords];
  const response=await fuelApi<VerifiedItineraryResponse>('/routes/itinerary',{
    method:'POST',signal,body:JSON.stringify({
      originCoords:origin,destinationCoords:trip.destinationCoords,roundTrip:false,
      manualStops:remaining.map(stop=>({
        id:stop.id,locationId:stop.location.id,stayMinutes:stop.stayMinutes
      })),
      acceptedSuggestions:[],limits:{mode:'destination'}
    })
  });
  return {...verifiedReroute(response,origin,trip.destinationCoords,trackedAtKm,
    new Date(),expectedWaypoints),remainingStopIds:remaining.map(stop=>stop.id)};
}

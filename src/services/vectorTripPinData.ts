import type {RouteStop,MeetingPoint,ConvoyParticipant} from '../types';

type Coords=[number,number]; // lat,lon
export const positionValid=(coords:unknown):coords is Coords=>Array.isArray(coords) && coords.length===2 &&
  coords.every((n)=>typeof n==='number' && Number.isFinite(n)) &&
  Math.abs(coords[0])<=90 && Math.abs(coords[1])<=180;
export const lngLat=([lat,lon]:Coords):[number,number]=>[lon,lat];

export function selectTripStops(stops:readonly RouteStop[]):RouteStop[] {
  const ids=new Set<string>();
  return stops.filter(stop=>{
    if(!stop || !stop.id || ids.has(stop.id) || !positionValid([stop.lat,stop.lng]))return false;
    if(stop.category==='posto' && !stop.type)return false;
    ids.add(stop.id);return true;
  });
}
export function selectMeetingPins(points:readonly MeetingPoint[]):MeetingPoint[] {
  const ids=new Set<string>();
  return points.filter(point=>{
    if(!point || !point.id || ids.has(point.id) || !positionValid(point.coords))return false;
    ids.add(point.id);return true;
  });
}
export function selectSharingParticipants(people:readonly ConvoyParticipant[],now=Date.now()):ConvoyParticipant[] {
  const ids=new Set<string>();
  return people.filter(person=>{
    if(!person || !person.id || ids.has(person.id) || !person.isSharingLocation ||
      !positionValid(person.coords) || !person.lastLocationTimestamp)return false;
    const ts=Date.parse(person.lastLocationTimestamp),elapsed=now-ts;
    if(!Number.isFinite(ts) || elapsed>180000 || elapsed < -60000)return false;
    ids.add(person.id);return true;
  });
}

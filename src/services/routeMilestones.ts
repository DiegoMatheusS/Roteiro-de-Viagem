export type RoutePoint = [number,number]; // latitude, longitude from verified OSRM route
export const MAX_ROUTE_MILESTONES = 160;

export function isValidRoutePoint(point:unknown):point is RoutePoint {
  return Array.isArray(point) && point.length===2 &&
    point.every(n=>typeof n==='number' && Number.isFinite(n)) &&
    Math.abs(point[0])<=90 && Math.abs(point[1])<=180;
}

/**
 * Return a sparse subset of the actual route geometry for small visual dots.
 * Long podcasts/trips can have thousands of geometry points: one DOM marker
 * every three points makes pinch, pan and camera following noticeably heavier.
 * Never invent intermediate locations or include departure/arrival as dots.
 */
export function selectRouteMilestones(routePath:readonly RoutePoint[],max=MAX_ROUTE_MILESTONES):RoutePoint[] {
  if(!Array.isArray(routePath) || routePath.length<5 || !Number.isFinite(max) || max<=0)return [];
  const limit=Math.min(MAX_ROUTE_MILESTONES,Math.floor(max));
  if(!limit)return [];
  const candidateCount=Math.floor((routePath.length-2)/3);
  const stride=3*Math.max(1,Math.ceil(candidateCount/limit));
  const chosen:RoutePoint[]=[];
  const seen=new Set<string>();
  for(let index=3; index<routePath.length-1 && chosen.length<limit;index+=stride){
    const point=routePath[index];
    if(!isValidRoutePoint(point))continue;
    const key=point.join(',');
    if(seen.has(key))continue;
    seen.add(key);
    chosen.push(point);
  }
  return chosen;
}

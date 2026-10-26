type Coordinates=[number,number];
const METERS_PER_DEGREE=111_195;
const MAX_ROUTE_OFFSET_METERS=150;
const PARALLEL_ROAD_TOLERANCE_METERS=20;
const valid=(point:Coordinates):boolean=>Array.isArray(point)&&point.length===2&&
  point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;

export interface RouteProjection{
  segmentStart:number;
  fraction:number;
  projected:Coordinates;
  segmentMeters:number;
}

/** Typed, validated copy of a road path. GPS projection runs on every fix over
 * routes with tens of thousands of vertices, so validity checks and coordinate
 * reads must not allocate. OSRM paths are replaced, never edited in place; the
 * length and end-point guard rebuilds the index if one ever is. */
interface PathIndex{length:number;first:number;last:number;lat:Float64Array;lon:Float64Array;ok:Uint8Array}
const pathIndexes=new WeakMap<Coordinates[],PathIndex>();
function indexPath(path:Coordinates[]):PathIndex{
  const length=path.length;
  const first=path[0]?.[0] as number,last=path[length-1]?.[0] as number;
  const cached=pathIndexes.get(path);
  if(cached&&cached.length===length&&cached.first===first&&cached.last===last)return cached;
  const lat=new Float64Array(length),lon=new Float64Array(length),ok=new Uint8Array(length);
  for(let i=0;i<length;i++){
    const point=path[i];
    if(valid(point)){lat[i]=point[0];lon[i]=point[1];ok[i]=1;}
  }
  const index={length,first,last,lat,lon,ok};
  pathIndexes.set(path,index);
  return index;
}

/** Projects GPS onto the actual road segments, not only OSRM vertices.
 * In a sparse highway polyline the driver can be far from both vertices
 * while still exactly on the route. Disambiguate loops using trip progress
 * only among segments geometrically close to the best match.
 *
 * Results are identical to a full scan. Segments whose bounding box is already
 * farther than the best candidate cannot contain a closer point, so they are
 * rejected with a few comparisons instead of a projection. */
export function projectRouteProgress(
  path:Coordinates[],location?:Coordinates,travelledKm=0,totalKm=0
):RouteProjection|null{
  if(path.length<2||!location||!valid(location))return null;
  const {lat,lon,ok}=indexPath(path);
  const lat0=location[0],lon0=location[1];
  const lonScale=METERS_PER_DEGREE*Math.max(0.1,Math.cos(lat0*Math.PI/180));
  const count=path.length;

  // Pass 1: distance to the nearest road segment.
  let bestSq=Infinity;
  for(let i=1;i<count;i++){
    if(!ok[i-1]||!ok[i])continue;
    const aLat=lat[i-1],aLon=lon[i-1],bLat=lat[i],bLon=lon[i];
    const minLat=aLat<bLat?aLat:bLat,maxLat=aLat<bLat?bLat:aLat;
    const lowY=(lat0<minLat?minLat-lat0:lat0>maxLat?lat0-maxLat:0)*METERS_PER_DEGREE;
    if(lowY*lowY>bestSq)continue;
    const minLon=aLon<bLon?aLon:bLon,maxLon=aLon<bLon?bLon:aLon;
    const lowX=(lon0<minLon?minLon-lon0:lon0>maxLon?lon0-maxLon:0)*lonScale;
    if(lowX*lowX+lowY*lowY>bestSq)continue;
    const dx=(bLon-aLon)*lonScale,dy=(bLat-aLat)*METERS_PER_DEGREE;
    const gx=(lon0-aLon)*lonScale,gy=(lat0-aLat)*METERS_PER_DEGREE;
    const sq=dx*dx+dy*dy;
    const t=sq>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/sq)):0;
    const ex=gx-t*dx,ey=gy-t*dy;
    const distanceSq=ex*ex+ey*ey;
    if(distanceSq<bestSq)bestSq=distanceSq;
  }
  const nearestMeters=Math.sqrt(bestSq);
  // A nearby road or a GPS jump must not paint kilometres of route as driven.
  if(nearestMeters>MAX_ROUTE_OFFSET_METERS)return null;

  const progress=Number.isFinite(travelledKm)&&Number.isFinite(totalKm)&&totalKm>0
    ?Math.min(1,Math.max(0,travelledKm/totalKm)):0;
  // Pass 2: among segments about as close as the best one (parallel roads,
  // loops that revisit the same place), prefer the one matching trip progress.
  const limit=nearestMeters+PARALLEL_ROAD_TOLERANCE_METERS,limitSq=limit*limit;
  let nearest:RouteProjection|null=null,bestScore=Infinity;
  for(let i=1;i<count;i++){
    if(!ok[i-1]||!ok[i])continue;
    const aLat=lat[i-1],aLon=lon[i-1],bLat=lat[i],bLon=lon[i];
    const minLat=aLat<bLat?aLat:bLat,maxLat=aLat<bLat?bLat:aLat;
    const lowY=(lat0<minLat?minLat-lat0:lat0>maxLat?lat0-maxLat:0)*METERS_PER_DEGREE;
    if(lowY*lowY>limitSq)continue;
    const minLon=aLon<bLon?aLon:bLon,maxLon=aLon<bLon?bLon:aLon;
    const lowX=(lon0<minLon?minLon-lon0:lon0>maxLon?lon0-maxLon:0)*lonScale;
    if(lowX*lowX+lowY*lowY>limitSq)continue;
    const dx=(bLon-aLon)*lonScale,dy=(bLat-aLat)*METERS_PER_DEGREE;
    const gx=(lon0-aLon)*lonScale,gy=(lat0-aLat)*METERS_PER_DEGREE;
    const sq=dx*dx+dy*dy;
    const t=sq>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/sq)):0;
    const meters=Math.hypot(gx-t*dx,gy-t*dy);
    if(meters>limit)continue;
    const fraction=(i-1+t)/(count-1);
    const score=meters+Math.abs(fraction-progress)*150;
    if(score<bestScore){
      bestScore=score;
      nearest={segmentStart:i-1,fraction:t,
        projected:[
          path[i-1][0]+(path[i][0]-path[i-1][0])*t,
          path[i-1][1]+(path[i][1]-path[i-1][1])*t
        ],segmentMeters:Math.hypot(dx,dy)};
    }
  }
  return nearest;
}

/** Stable integer vertex used by existing MapLibre and fallback callers. */
export function routeProgressIndex(
  path:Coordinates[],location?:Coordinates,travelledKm=0,totalKm=0
):number|null{
  const point=projectRouteProgress(path,location,travelledKm,totalKm);
  return point?point.segmentStart+(point.fraction>=0.5?1:0):null;
}

/** Quantize the snapped position to 20m so sparse road geometries update the
 * drawn line without uploading thousands of GeoJSON coordinates every GPS tick. */
export function routeProgressRenderKey(
  path:Coordinates[],location?:Coordinates,travelledKm=0,totalKm=0
):string|null{
  const point=projectRouteProgress(path,location,travelledKm,totalKm);
  return point?`${point.segmentStart}:${Math.floor(point.fraction*point.segmentMeters/20)}`:null;
}

/** Divide a linha rodoviária em trechos percorridos e a percorrer.
 * Considera tanto o GPS como a distância realizada: em rotas circulares,
 * o começo e o fim podem estar no mesmo lugar.
 */
export function splitRouteAtPosition(
  path: [number, number][],
  location?: [number, number],
  travelledKm = 0,
  totalKm = 0
): { travelled: [number, number][]; remaining: [number, number][] } {
  const position=projectRouteProgress(path,location,travelledKm,totalKm);
  if(!position)return {travelled:[],remaining:path};
  const {segmentStart,fraction,projected}=position;
  if(fraction<=1e-8){
    return {travelled:path.slice(0,segmentStart+1),remaining:path.slice(segmentStart)};
  }
  if(fraction>=1-1e-8){
    return {travelled:path.slice(0,segmentStart+2),remaining:path.slice(segmentStart+1)};
  }
  // This coordinate lies on a verified OSRM segment, never on an invented road.
  return {travelled:[...path.slice(0,segmentStart+1),projected],
    remaining:[projected,...path.slice(segmentStart+1)]};
}

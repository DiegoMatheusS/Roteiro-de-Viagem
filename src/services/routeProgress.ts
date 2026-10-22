type Coordinates=[number,number];
const METERS_PER_DEGREE=111_195;
const MAX_ROUTE_OFFSET_METERS=150;
const PARALLEL_ROAD_TOLERANCE_METERS=20;
const valid=(point:Coordinates):boolean=>Array.isArray(point)&&point.length===2&&
  point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;

interface RouteProjection{
  segmentStart:number;
  fraction:number;
  projected:Coordinates;
  segmentMeters:number;
}

/** Projects GPS onto the actual road segments, not only OSRM vertices.
 * In a sparse highway polyline the driver can be far from both vertices
 * while still exactly on the route. Disambiguate loops using trip progress
 * only among segments geometrically close to the best match. */
function projectRouteProgress(
  path:Coordinates[],location?:Coordinates,travelledKm=0,totalKm=0
):RouteProjection|null{
  if(path.length<2||!location||!valid(location))return null;
  const lonScale=METERS_PER_DEGREE*Math.max(0.1,Math.cos(location[0]*Math.PI/180));
  const projected=(index:number)=>{
    const a=path[index-1],b=path[index];
    if(!valid(a)||!valid(b))return null;
    const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*METERS_PER_DEGREE;
    const gx=(location[1]-a[1])*lonScale,gy=(location[0]-a[0])*METERS_PER_DEGREE;
    const sq=dx*dx+dy*dy;
    const t=sq>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/sq)):0;
    return {meters:Math.hypot(gx-t*dx,gy-t*dy),t,
      segmentMeters:Math.hypot(dx,dy)};
  };
  let nearestMeters=Infinity;
  for(let index=1;index<path.length;index++){
    const candidate=projected(index);
    if(candidate)nearestMeters=Math.min(nearestMeters,candidate.meters);
  }
  // A nearby road or a GPS jump must not paint kilometres of route as driven.
  if(nearestMeters>MAX_ROUTE_OFFSET_METERS)return null;

  const progress=Number.isFinite(travelledKm)&&Number.isFinite(totalKm)&&totalKm>0
    ?Math.min(1,Math.max(0,travelledKm/totalKm)):0;
  let nearest:RouteProjection|null=null,bestScore=Infinity;
  for(let index=1;index<path.length;index++){
    const candidate=projected(index);
    if(!candidate || candidate.meters>nearestMeters+PARALLEL_ROAD_TOLERANCE_METERS)continue;
    const fraction=(index-1+candidate.t)/(path.length-1);
    const score=candidate.meters+Math.abs(fraction-progress)*150;
    if(score<bestScore){
      bestScore=score;
      nearest={segmentStart:index-1,fraction:candidate.t,
        projected:[
          path[index-1][0]+(path[index][0]-path[index-1][0])*candidate.t,
          path[index-1][1]+(path[index][1]-path[index-1][1])*candidate.t
        ],segmentMeters:candidate.segmentMeters};
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

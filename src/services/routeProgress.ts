type Coordinates=[number,number];
const METERS_PER_DEGREE=111_195;
const MAX_ROUTE_OFFSET_METERS=150;
const PARALLEL_ROAD_TOLERANCE_METERS=20;
const valid=(point:Coordinates):boolean=>Array.isArray(point)&&point.length===2&&
  point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180;

/** Projects GPS onto the actual road segments, not only OSRM vertices.
 * In a sparse highway polyline the driver can be far from both vertices
 * while still exactly on the route. Disambiguate loops using trip progress
 * only among segments geometrically close to the best match. */
export function routeProgressIndex(
  path:Coordinates[],location?:Coordinates,travelledKm=0,totalKm=0
):number|null{
  if(path.length<2||!location||!valid(location))return null;
  const lonScale=METERS_PER_DEGREE*Math.max(0.1,Math.cos(location[0]*Math.PI/180));
  const projected=(index:number)=>{
    const a=path[index-1],b=path[index];
    if(!valid(a)||!valid(b))return null;
    const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*METERS_PER_DEGREE;
    const gx=(location[1]-a[1])*lonScale,gy=(location[0]-a[0])*METERS_PER_DEGREE;
    const sq=dx*dx+dy*dy;
    const t=sq>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/sq)):0;
    return {meters:Math.hypot(gx-t*dx,gy-t*dy),t};
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
  let nearest:number|null=null,bestScore=Infinity;
  for(let index=1;index<path.length;index++){
    const candidate=projected(index);
    if(!candidate || candidate.meters>nearestMeters+PARALLEL_ROAD_TOLERANCE_METERS)continue;
    const fraction=(index-1+candidate.t)/(path.length-1);
    const score=candidate.meters+Math.abs(fraction-progress)*150;
    if(score<bestScore){
      bestScore=score;
      nearest=candidate.t<0.5?index-1:index;
    }
  }
  return nearest;
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
  const index=routeProgressIndex(path,location,travelledKm,totalKm);
  if(index===null)return {travelled:[],remaining:path};
  return {travelled:path.slice(0,index+1),remaining:path.slice(index)};
}

/** Get the actual nearest OSRM vertex, or null when the driver is too far
 * from the route. Uses travelled distance to disambiguate loops/intersections.
 * Reused by MapLibre to skip identical GeoJSON uploads on long routes. */
export function routeProgressIndex(
  path:[number,number][],location?:[number,number],travelledKm=0,totalKm=0
):number|null{
  if(path.length<2||!location)return null;
  const latitudeFactor=Math.max(0.1,Math.cos(location[0]*Math.PI/180));
  const progress=totalKm>0?Math.min(1,Math.max(0,travelledKm/totalKm)):0;
  let nearest=0,score=Infinity,directDistance=Infinity;
  for(let index=0;index<path.length;index++){
    const point=path[index];
    const dy=(point[0]-location[0])*111;
    const dx=(point[1]-location[1])*111*latitudeFactor;
    const distance=Math.hypot(dx,dy);
    const candidate=distance+Math.abs(index/(path.length-1)-progress)*0.15;
    if(candidate<score){score=candidate;nearest=index;directDistance=distance;}
  }
  return directDistance>1.5?null:nearest;
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

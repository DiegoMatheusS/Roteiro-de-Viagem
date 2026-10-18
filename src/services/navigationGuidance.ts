import type { NavigationManeuver } from '../types';

type Coordinates=[number,number];
const LAT_METERS=111_195;
function projectSegment(gps:Coordinates,a:Coordinates,b:Coordinates,lonScale:number){
  const dx=(b[1]-a[1])*lonScale,dy=(b[0]-a[0])*LAT_METERS;
  const gx=(gps[1]-a[1])*lonScale,gy=(gps[0]-a[0])*LAT_METERS;
  const squared=dx*dx+dy*dy;
  const fraction=squared>0?Math.max(0,Math.min(1,(gx*dx+gy*dy)/squared)):0;
  return {length:Math.sqrt(squared),fraction,error:Math.hypot(gx-fraction*dx,gy-fraction*dy)};
}

/** Projeta o GPS sobre o caminho antes de anunciar uma manobra. Não inventa curvas.
 * O avanço registrado resolve locais repetidos em circuitos/cruzamentos; nunca
 * substitui o GPS por um trecho geograficamente distante. */
export function nextNavigationGuidance(path: Coordinates[], steps: NavigationManeuver[] | undefined,
  gps?: Coordinates,travelledKm=0,totalKm=0): { text:string; road:string; meters:number; direction:'left'|'right'|'straight'|'arrive'|'roundabout' } | null {
  if (!gps || !steps?.length || path.length < 2) return null;
  const lonScale=LAT_METERS*Math.max(0.1,Math.cos(gps[0]*Math.PI/180));
  let routeMeters=0,bestMeters=0,bestError=Infinity;
  for(let i=1;i<path.length;i++){
    const point=projectSegment(gps,path[i-1],path[i],lonScale);
    if(point.error<bestError){bestError=point.error;bestMeters=routeMeters+point.length*point.fraction;}
    routeMeters+=point.length;
  }
  // Nunca anunciar conversões quando o usuário estiver fora da via mapeada.
  if(bestError>250)return null;
  if(Number.isFinite(travelledKm) && travelledKm>=0 && Number.isFinite(totalKm) && totalKm>0){
    const expected=Math.min(1,travelledKm/totalKm)*routeMeters;
    let accumulated=0,bestProgressError=Infinity;
    // A segunda passagem evita guardar uma cópia da rota a cada amostra GPS.
    for(let i=1;i<path.length;i++){
      const point=projectSegment(gps,path[i-1],path[i],lonScale);
      const along=accumulated+point.length*point.fraction;
      const error=Math.abs(along-expected);
      // Até 20 m de tolerância entre candidatos próximos (ruído GPS). Mantém
      // o limite fora da rota e exclui outros trechos mais afastados.
      if(point.error<=Math.min(250,bestError+20) && error<bestProgressError){
        bestProgressError=error;bestMeters=along;
      }
      accumulated+=point.length;
    }
  }
  const progressKm = routeMeters>0 ? bestMeters/routeMeters * steps.reduce((max,step)=>Math.max(max,step.distanceFromStartKm),0) : 0;
  const upcoming=steps.find((step,index)=>step.type!=='depart' && (step.type!=='arrive' || index===steps.length-1) && step.distanceFromStartKm>=progressKm-0.025);
  if(!upcoming)return null;
  const modifier=upcoming.modifier||'';
  const direction=upcoming.type==='arrive'?'arrive':upcoming.type==='roundabout'||upcoming.type==='rotary'?'roundabout':
    /left/.test(modifier)?'left':/right/.test(modifier)?'right':'straight';
  const text=direction==='arrive'?'Chegando ao destino':direction==='roundabout'?'Entre na rotatória':
    direction==='left'?'Vire à esquerda':direction==='right'?'Vire à direita':'Siga em frente';
  const meters=Math.max(0,Math.round((upcoming.distanceFromStartKm-progressKm)*1000/10)*10);
  return {text,road:upcoming.name,meters,direction};
}

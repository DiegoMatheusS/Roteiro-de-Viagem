import type { NavigationManeuver } from '../types';

/** Projeta o GPS sobre o caminho antes de anunciar uma manobra. Não inventa curvas. */
export function nextNavigationGuidance(path: [number, number][], steps: NavigationManeuver[] | undefined,
  gps?: [number, number]): { text:string; road:string; meters:number; direction:'left'|'right'|'straight'|'arrive'|'roundabout' } | null {
  if (!gps || !steps?.length || path.length < 2) return null;
  const radians = Math.PI / 180;
  const latScale = 111_195;
  const lonScale = latScale * Math.max(0.1,Math.cos(gps[0]*radians));
  const distance = (a:[number,number], b:[number,number]) => Math.hypot((b[0]-a[0])*latScale,(b[1]-a[1])*lonScale);
  let routeMeters=0,bestMeters=0,bestError=Infinity;
  for (let i=1;i<path.length;i++) {
    const a=path[i-1], b=path[i];
    const dx=(b[1]-a[1])*lonScale, dy=(b[0]-a[0])*latScale;
    const lengthSquared=dx*dx+dy*dy;
    const t=lengthSquared>0?Math.max(0,Math.min(1,(((gps[1]-a[1])*lonScale)*dx+((gps[0]-a[0])*latScale)*dy)/lengthSquared)):0;
    const projected:[number,number]=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
    const error=distance(gps,projected);
    const length=Math.sqrt(lengthSquared);
    if(error<bestError){bestError=error;bestMeters=routeMeters+length*t;}
    routeMeters+=length;
  }
  // Nunca anunciar conversões quando o usuário estiver fora da via mapeada.
  if(bestError>250)return null;
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

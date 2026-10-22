import type {ReroutedNavigation} from './autoReroute';
import type {RoadPoint} from './offlineRoadGraph';
import {calculateOfflineRoadRoute,roadDistanceMeters} from './offlineRoadGraph';
import {findOfflineRoadGraph} from './offlineRoadStorage';

export async function requestOfflineRoadReroute(input:{
  points:RoadPoint[];trackedAtKm:number;remainingStopIds:string[];
  signal?:AbortSignal
}):Promise<ReroutedNavigation>{
  const {points,trackedAtKm,signal,remainingStopIds}=input;
  if(signal?.aborted)throw Error('Recálculo offline cancelado.');
  if(points.length<2||points.length>8||
    !Number.isFinite(trackedAtKm)||trackedAtKm<0)
    throw Error('Itinerário incompatível com o roteamento local.');
  const graph=await findOfflineRoadGraph(points);
  if(!graph)throw Error('A rede de ruas offline dessa região não está instalada.');
  if(signal?.aborted)throw Error('Recálculo offline cancelado.');
  const routePath:RoadPoint[]=[];
  let distanceKm=0,drivingMinutes=0;
  for(let i=1;i<points.length;i++){
    const leg=calculateOfflineRoadRoute(graph,points[i-1],points[i]);
    if(!leg)throw Error('Não há ligação rodoviária offline verificada entre os pontos.');
    // Ensure the snapped points are close to the original requested waypoints.
    if(roadDistanceMeters(leg.routePath[0],points[i-1])>75 ||
      roadDistanceMeters(leg.routePath[leg.routePath.length-1],points[i])>75)
      throw Error('Rua offline está distante de uma parada obrigatória.');
    distanceKm+=leg.distanceKm;drivingMinutes+=leg.drivingMinutes;
    routePath.push(...(routePath.length?leg.routePath.slice(1):leg.routePath));
    if(routePath.length>8000)throw Error('Rota offline muito complexa.');
  }
  if(signal?.aborted)throw Error('Recálculo offline cancelado.');
  // Only depart/arrive: no turn instructions without a supported maneuver
  // model or trustworthy turn restrictions. Map line remains road-based.
  return {
    originCoords:points[0],routePath,routeSteps:[
      {coords:routePath[0],distanceFromStartKm:0,type:'depart',
        name:'Rota local (sem instruções de conversão)'},
      {coords:routePath[routePath.length-1],distanceFromStartKm:distanceKm,
        type:'arrive',name:'Destino'}
    ],
    distanceKm:Number(distanceKm.toFixed(3)),
    drivingMinutes:Math.max(1,Math.ceil(drivingMinutes)),
    trackedAtKm,remainingStopIds,
    updatedAt:new Date().toISOString(),
    source:'offline-graph'
  };
}

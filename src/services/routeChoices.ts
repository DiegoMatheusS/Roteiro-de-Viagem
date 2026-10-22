import { fuelApi } from './fuelApi';
import { createRoadDraft } from './touristCircuit';
import type { NavigationManeuver, TripPlan, Vehicle } from '../types';
import {calculateOfflineRoadRoute,roadDistanceMeters} from './offlineRoadGraph';
import {findOfflineRoadGraph} from './offlineRoadStorage';

export interface VerifiedRouteChoice {
  id: string;
  kind: 'fast' | 'alternative' | 'tourist' | 'panoramic' | 'stroll';
  distanceKm: number;
  durationMinutes: number;
  routePath: [number, number][];
  routeSteps: NavigationManeuver[];
  scenicStop?: { name: string; kind?: string; coords: [number, number] };
  trafficStatus: 'unavailable';
  tollStatus: 'unchecked';
  /** Explicit source; only a genuine server response is marked OSRM. */
  source?:'OSRM'|'offline-graph';
}

/** Mais interesse turístico primeiro. Não chamar de passeio um desvio sem atrações cadastradas. */
export function prioritizeRoleRoutes(options: VerifiedRouteChoice[]): VerifiedRouteChoice[] {
  const rank:Record<VerifiedRouteChoice['kind'],number> = {
    panoramic:0,tourist:1,stroll:2,alternative:3,fast:4
  };
  return [...options].sort((a,b)=>rank[a.kind]-rank[b.kind] || a.durationMinutes-b.durationMinutes);
}

export async function fetchOfflineRouteChoice(originCoords:[number,number],destinationCoords:[number,number],
  signal?:AbortSignal):Promise<VerifiedRouteChoice[]>{
  if(signal?.aborted)throw new Error('Cálculo cancelado.');
  if(typeof indexedDB==='undefined')
    throw new Error('Armazenamento de ruas offline indisponível neste dispositivo.');
  const graph=await findOfflineRoadGraph([originCoords,destinationCoords]);
  if(signal?.aborted)throw new Error('Cálculo cancelado.');
  if(!graph)throw new Error('Nenhuma rede viária offline instalada cobre origem e destino.');
  return [offlineChoiceFromGraph(graph,originCoords,destinationCoords)];
}
/** Pure converter for tests and for a previously verified licensed road graph. */
export function offlineChoiceFromGraph(graph:import('./offlineRoadGraph').OfflineRoadGraph,
  originCoords:[number,number],destinationCoords:[number,number]):VerifiedRouteChoice{
  const path=calculateOfflineRoadRoute(graph,originCoords,destinationCoords);
  if(!path||path.routePath.length<2 ||
    roadDistanceMeters(path.routePath[0],originCoords)>75 ||
    roadDistanceMeters(path.routePath[path.routePath.length-1],destinationCoords)>75)
    throw new Error('Não há um percurso offline conectado para esse destino.');
  return {
    id:'offline-'+graph.regionId,kind:'fast',
    source:'offline-graph',
    distanceKm:Number(path.distanceKm.toFixed(3)),
    durationMinutes:Math.max(1,Math.ceil(path.drivingMinutes)),
    routePath:path.routePath,
    routeSteps:[
      {coords:path.routePath[0],distanceFromStartKm:0,type:'depart',name:'Trajeto local sem instruções de curva'},
      {coords:path.routePath[path.routePath.length-1],distanceFromStartKm:path.distanceKm,
        type:'arrive',name:'Destino'}
    ],
    trafficStatus:'unavailable',tollStatus:'unchecked'
  };
}
export async function fetchRouteChoices(originCoords: [number, number], destinationCoords: [number, number], signal?: AbortSignal) {
  if(typeof navigator!=='undefined' && navigator.onLine===false)
    return fetchOfflineRouteChoice(originCoords,destinationCoords,signal);
  try{
    const data = await fuelApi<{ options: VerifiedRouteChoice[]; trafficDataAvailable: boolean }>('/routes/alternatives', {
      method: 'POST', signal, body: JSON.stringify({ originCoords, destinationCoords })
    });
    return prioritizeRoleRoutes(data.options.filter(option => option.routePath?.length > 1 && option.distanceKm > 0)
      .map(option=>({...option,source:'OSRM' as const})));
  }catch(error){
    if(signal?.aborted)throw error;
    try{return await fetchOfflineRouteChoice(originCoords,destinationCoords,signal);}
    catch{throw error;}
  }
}

export function choiceLabel(choice: VerifiedRouteChoice, index: number) {
  if (choice.kind === 'panoramic') return 'Rota panorâmica';
  if (choice.kind === 'tourist') return 'Rota turística';
  if (choice.kind === 'stroll') return 'Rolê pela cidade';
  if(choice.source==='offline-graph')return 'Trajeto offline · ruas locais';
  if (choice.kind === 'fast') return 'Rota mais rápida';
  return 'Rota alternativa';
}

export function choiceToTrip(choice: VerifiedRouteChoice, vehicle: Vehicle,
  originCoords: [number, number], destination: { name: string; coords: [number, number] }): TripPlan {
  const draft = createRoadDraft({
    originName: 'Sua localização atual', originCoords,
    destinationName: destination.name, destinationCoords: destination.coords,
    vehicle, circular: false, limits: { mode: 'destination' }
  });
  const consumption = vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage;
  const liters = consumption > 0 ? choice.distanceKm / consumption : 0;
  return {
    ...draft,
    modality: choice.kind === 'panoramic' ? 'panoramica' : ['tourist','stroll'].includes(choice.kind) ? 'turistica' : 'rapida',
    distanceKm: choice.distanceKm, durationMinutes: choice.durationMinutes, drivingMinutes: choice.durationMinutes,
    routePath: choice.routePath, routeSteps: choice.routeSteps,
    routingSource: choice.source==='offline-graph'?'offline-graph':'OSRM',
    waypointOrder: choice.scenicStop ? [originCoords,choice.scenicStop.coords,destination.coords] : [originCoords,destination.coords],
    stops: choice.scenicStop ? [{ id: `scenic-${choice.id}`, name: choice.scenicStop.name, category: 'endereco',
      lat:choice.scenicStop.coords[0],lng:choice.scenicStop.coords[1],description:'Atração turística cadastrada',
      recommendedMinutes:0 }] : [],
    estimatedFuelLiters: Number(liters.toFixed(2)),
    tollsStatus: 'unknown',
    routeWarnings:choice.source==='offline-graph'
      ? ['Trajeto offline calculado somente em ruas importadas. Sem instruções de curva, trânsito ao vivo nem verificação de pedágios. Respeite a sinalização.']
      : ['Trânsito em tempo real indisponível. Pedágios ainda não verificados para esta alternativa.']
  };
}

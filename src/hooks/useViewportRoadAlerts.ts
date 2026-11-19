import {useCallback,useEffect,useState} from 'react';
import {fuelApi} from '../services/fuelApi';
import type {RoadAlert} from '../types/roadAlerts';

/** Área que o usuário realmente está visualizando, sem filtro de raio/GPS. */
export interface RoadAlertViewport {
  south:number; north:number; west:number; east:number;
}

export function normalizedRoadAlertViewport(view:RoadAlertViewport|null):RoadAlertViewport|null {
  if(!view||![view.south,view.north,view.west,view.east].every(Number.isFinite))return null;
  const south=Math.max(-90,Math.floor(view.south*1000)/1000);
  const north=Math.min(90,Math.ceil(view.north*1000)/1000);
  const west=Math.max(-180,Math.floor(view.west*1000)/1000);
  const east=Math.min(180,Math.ceil(view.east*1000)/1000);
  if(south>=north||west>=east)return null;
  return {south,north,west,east};
}

export function useViewportRoadAlerts(viewport:RoadAlertViewport|null){
  const bounds=normalizedRoadAlertViewport(viewport);
  const key=bounds?[bounds.south,bounds.north,bounds.west,bounds.east].join(','):'';
  const [alerts,setAlerts]=useState<RoadAlert[]>([]);
  const [revision,setRevision]=useState(0);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);

  useEffect(()=>{
    if(!key){setAlerts([]);return;}
    const controller=new AbortController();
    const [south,north,west,east]=key.split(',').map(Number);
    const query=new URLSearchParams({south:String(south),north:String(north),west:String(west),east:String(east)});
    const refresh=async()=>{
      try{
        const result=await fuelApi<{alerts:RoadAlert[]}>(`/road-alerts/map?${query}`,{signal:controller.signal});
        if(!controller.signal.aborted)setAlerts(Array.isArray(result.alerts)?result.alerts:[]);
      }catch{
        // Manter os marcadores anteriores enquanto a conexão volta.
        // Expiração e aprovação são verificadas pelo controlador do mapa.
      }
    };
    // Debounce apenas para economizar rede durante o gesto; sem raio mínimo.
    const timeout=window.setTimeout(()=>void refresh(),350);
    const interval=window.setInterval(()=>{
      if(!document.hidden)void refresh();
    },120000);
    const onVisible=()=>{if(!document.hidden)void refresh();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{
      controller.abort();window.clearTimeout(timeout);window.clearInterval(interval);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[key,revision]);

  return {alerts,reload};
}

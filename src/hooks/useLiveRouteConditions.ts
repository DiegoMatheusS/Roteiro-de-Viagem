import { useEffect, useRef, useState } from 'react';
import type { TripPlan, VehicleType } from '../types';
import type { DeviceLocation } from '../services/locationService';
import { requestWeather,requestTolls,tollBudgetPatch } from '../services/routeConditions';
export function useLiveRouteConditions(trip: TripPlan | null, vehicleType: VehicleType, onPatch: (id: string, patch: Partial<TripPlan>) => void, enabled: boolean, location?: DeviceLocation | null) {
  const latest=useRef({trip,onPatch,location}); latest.current={trip,onPatch,location};
  const [attempt,setAttempt]=useState(0);
  const [state,setState]=useState({ busy:false,weatherError:'',tollError:'' });
  const key=JSON.stringify([trip?.id,trip?.status,trip?.routePath,trip?.durationMinutes,trip?.drivingMinutes,trip?.stops,trip?.departureAt,vehicleType,enabled,!!location && Date.now()-location.timestamp <= 60000,attempt]);
  useEffect(() => {
    if(!enabled || !trip?.routePath.length || trip.routingSource !== 'OSRM') { setState({busy:false,weatherError:'',tollError:''}); return; }
    let controller: AbortController | null=null, disposed=false;
    const refresh=async () => {
      controller?.abort(); controller=new AbortController(); const signal=controller.signal;
      const current=latest.current.trip; if(!current) return;
      setState({busy:true,weatherError:'',tollError:''});
      const [weather,tolls]=await Promise.allSettled([requestWeather(current,signal,latest.current.location),requestTolls(current,vehicleType,signal)]);
      if(disposed || signal.aborted || latest.current.trip?.id !== current.id) return;
      const patch: Partial<TripPlan> = weather.status === 'fulfilled' ? {weatherPoints:weather.value.weatherPoints,hasRainRisk:weather.value.hasRainRisk,weatherSource:weather.value.source,weatherUpdatedAt:weather.value.updatedAt} : {weatherPoints:[],hasRainRisk:false,weatherSource:undefined,weatherUpdatedAt:undefined};
      if(tolls.status === 'fulfilled') Object.assign(patch,tollBudgetPatch(latest.current.trip!,tolls.value));
      else Object.assign(patch,tollBudgetPatch(latest.current.trip!,{tolls:[],knownCost:0,status:'unknown',mapUnavailable:true,updatedAt:new Date().toISOString(),warning:'Tarifas indisponíveis.'}));
      latest.current.onPatch(current.id,patch);
      setState({busy:false,weatherError:weather.status === 'rejected' ? weather.reason.message : '',tollError:tolls.status === 'rejected' ? tolls.reason.message : tolls.value.mapUnavailable ? 'Mapa de pedágios indisponível: exibindo as tarifas já verificadas no servidor.' : ''});
    };
    void refresh();
    const timer=window.setInterval(() => { if(!document.hidden) void refresh(); },15*60000);
    let resumeTimer: ReturnType<typeof setTimeout> | null=null;
    const resume=() => { if(!document.hidden){if(resumeTimer)clearTimeout(resumeTimer);resumeTimer=setTimeout(() => {void refresh();},2500);} };
    window.addEventListener('online',resume); document.addEventListener('visibilitychange',resume); window.addEventListener('rdv:tolls-changed',resume);
    return () => { disposed=true; controller?.abort(); clearInterval(timer); if(resumeTimer)clearTimeout(resumeTimer); window.removeEventListener('online',resume); document.removeEventListener('visibilitychange',resume); window.removeEventListener('rdv:tolls-changed',resume); };
  },[key]);
  return {...state,refresh:() => setAttempt(v => v+1)};
}

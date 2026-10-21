import { useEffect,useRef,useState } from 'react';
import type { TripPlan } from '../types';
import type { DeviceLocation } from '../services/locationService';
import { distanceBetweenKm } from '../services/gpsTracking';
import {
  eligibleDirectReroute,evaluateOffRoute,initialOffRouteState,
  requestAutomaticReroute,type ReroutedNavigation
} from '../services/autoReroute';

export type AutoRerouteNotice='idle'|'recalculating'|'updated'|'unavailable';

/** GPS monitoring remains local. A road-network request starts only after
 * several reliable fixes confirm real motion away from a direct OSRM route. */
export function useAutoReroute(options:{
  trip:TripPlan;position:DeviceLocation|null;trackedDistanceKm:number;
  enabled:boolean;onReroute:(next:ReroutedNavigation)=>void;
}):AutoRerouteNotice{
  const [notice,setNotice]=useState<AutoRerouteNotice>('idle');
  const state=useRef(initialOffRouteState());
  const lastRouteKey=useRef('');
  const current=useRef(options);current.current=options;
  const inflight=useRef<AbortController|null>(null);
  const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const clearNotice=()=>{
    if(noticeTimer.current!==null){clearTimeout(noticeTimer.current);noticeTimer.current=null;}
  };
  const routeKey=`${options.trip.id}:${options.trip.navigationReroute?.updatedAt||'original'}`;
  useEffect(()=>{
    const oldTrip=lastRouteKey.current.split(':')[0];
    // Preserve the 60-second throttle when a request replaces the route.
    const lastAttemptAt=oldTrip===options.trip.id?state.current.lastAttemptAt:0;
    state.current={...initialOffRouteState(),lastAttemptAt};
    lastRouteKey.current=routeKey;
  },[routeKey,options.trip.id]);

  useEffect(()=>{
    if(!options.enabled){
      inflight.current?.abort();inflight.current=null;
      state.current={...state.current,outsideSince:null,outsideCount:0,firstOutside:null};
      clearNotice();setNotice('idle');
    }
    return ()=>{
      inflight.current?.abort();inflight.current=null;
      clearNotice();
    };
  },[options.enabled,options.trip.id]);

  useEffect(()=>{
    if(!options.enabled || !eligibleDirectReroute(options.trip) || inflight.current)return;
    const fix=options.position;
    if(!fix){
      state.current={...state.current,outsideSince:null,outsideCount:0,firstOutside:null};
      return;
    }
    const route=options.trip.navigationReroute?.routePath||options.trip.routePath;
    const decision=evaluateOffRoute(state.current,fix,route);
    state.current=decision.state;
    if(!decision.trigger)return;
    const controller=new AbortController();
    inflight.current=controller;
    clearNotice();setNotice('recalculating');
    void requestAutomaticReroute(options.trip,fix.coords,options.trackedDistanceKm,controller.signal)
      .then(next=>{
        if(controller.signal.aborted || !current.current.enabled ||
          current.current.trip.id!==options.trip.id)return;
        const live=current.current.position;
        // Do not install a route whose start is now far behind the driver.
        if(!live || distanceBetweenKm(live.coords,next.originCoords)>.35){
          setNotice('unavailable');return;
        }
        current.current.onReroute(next);
        setNotice('updated');
        clearNotice();
        noticeTimer.current=setTimeout(()=>setNotice('idle'),6000);
      })
      .catch(error=>{
        if(controller.signal.aborted)return;
        void error; // Network errors do not replace an existing verified route.
        if(current.current.enabled)setNotice('unavailable');
      })
      .finally(()=>{if(inflight.current===controller)inflight.current=null;});
  },[options.enabled,options.trip.id,options.trip.navigationReroute?.updatedAt,
      options.position?.timestamp,options.trackedDistanceKm,options.trip.routePath]);
  return notice;
}

import React,{useEffect,useRef,useState} from 'react';
import {InteractiveMap} from './InteractiveMap';
import {useDeviceLocation} from '../hooks/useDeviceLocation';

/** Render a real, interactive map immediately. Account verification and state
 * reconciliation continue in App; no guest trip/profile writes are allowed
 * before the correct account namespace has been hydrated. */
export function StartupMap({notice}:{notice?:React.ReactNode}){
  const gps=useDeviceLocation(true,'role-start-map');
  const position=gps.status==='ready'?gps.position?.coords:undefined;
  const centered=useRef(false);
  const [centerRequest,setCenterRequest]=useState(0);
  const [showBrand,setShowBrand]=useState(true);
  // This is only a short brand cue, not a blocker for GPS or account loading.
  useEffect(()=>{
    const timer=window.setTimeout(()=>setShowBrand(false),2100);
    return ()=>window.clearTimeout(timer);
  },[]);
  useEffect(()=>{
    if(position && !centered.current){
      centered.current=true;setCenterRequest(value=>value+1);
    }
  },[position?.[0],position?.[1]]);
  return <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-100" aria-label="Mapa do Rolê">
    <InteractiveMap roadStyle initialStyle="light" showFuelStations={false}
      className="w-full h-full" userLiveCoords={position}
      centerOnUserRequest={centerRequest}/>
    {showBrand&&<div className="rdv-start-brand" aria-hidden="true">
      <span className="rdv-start-brand-wave"/>
      <span className="rdv-start-brand-wave rdv-start-brand-wave-second"/>
      <span className="rdv-start-brand-logo">
        <img src="/roteiro-logo.png" alt="" width="68" height="68" decoding="async"/>
      </span>
    </div>}
    {notice&&<div className="absolute z-50 bottom-6 left-3 right-3 mx-auto max-w-md
      rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-md text-sm text-slate-800"
      role="status">{notice}</div>}
  </main>;
}

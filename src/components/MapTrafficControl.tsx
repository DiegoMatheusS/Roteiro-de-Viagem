import React,{useEffect,useRef,useState} from 'react';
import {CarFront} from 'lucide-react';
import {createTrafficFlowController,type TrafficMapPort,type TrafficState} from '../services/trafficFlow';

/** Compact traffic toggle: only the roads change, never open a status panel. */
export function MapTrafficControl({port,offline=false,navigation=false}:{port:TrafficMapPort|null;offline?:boolean;navigation?:boolean}){
  const [enabled,setEnabled]=useState(false),[state,setState]=useState<TrafficState>('off');
  const controller=useRef<ReturnType<typeof createTrafficFlowController>|null>(null);
  useEffect(()=>{
    if(!port)return;
    const current=createTrafficFlowController({port,onState:setState,offline,initialEnabled:enabled});controller.current=current;
    current.setEnabled(enabled);
    return()=>{current.destroy();if(controller.current===current)controller.current=null;};
  },[port]);
  useEffect(()=>{controller.current?.setEnabled(enabled);},[enabled]);
  useEffect(()=>{controller.current?.setOffline(offline);},[offline]);
  return <div data-traffic-state={state} data-traffic-control data-traffic-enabled={enabled}
    className={`absolute z-30 ${navigation?'right-5 bottom-[calc(var(--rdv-nav-panel-height)+151px)]':'right-4 bottom-[370px] rdv-map-traffic-control'}`}>
    <button type="button" aria-label={enabled?'Ocultar trânsito':'Mostrar trânsito'}
      aria-pressed={enabled} title={enabled?'Ocultar trânsito':'Mostrar trânsito'}
      onClick={()=>setEnabled(value=>!value)}
      className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_4px_18px_rgba(15,23,42,.16)] transition-colors active:scale-95 ${enabled
        ?'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-200/65 shadow-[0_4px_18px_rgba(37,99,235,.3)]'
        :'border-slate-200 bg-white text-blue-700'}`}>
      <CarFront size={23} strokeWidth={2.1} aria-hidden="true"/>
    </button>
  </div>;
}

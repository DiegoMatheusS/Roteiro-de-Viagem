import React,{useEffect,useRef,useState} from 'react';
import {CarFront} from 'lucide-react';
import {createTrafficFlowController,type TrafficMapPort,type TrafficState} from '../services/trafficFlow';

const messages:Record<TrafficState,string>={loading:'Carregando trânsito…',live:'Trânsito ao vivo',unavailable:'Trânsito indisponível',
  off:'Trânsito desativado',offline:'Trânsito sem conexão',paused:'Trânsito pausado','zoom-in':'Aproxime para ver o trânsito'};
export function MapTrafficControl({port,offline=false,navigation=false}:{port:TrafficMapPort|null;offline?:boolean;navigation?:boolean}){
  const [enabled,setEnabled]=useState(true),[state,setState]=useState<TrafficState>('loading');
  const controller=useRef<ReturnType<typeof createTrafficFlowController>|null>(null);
  useEffect(()=>{
    if(!port)return;
    const current=createTrafficFlowController({port,onState:setState,offline});controller.current=current;
    current.setEnabled(enabled);
    return()=>{current.destroy();if(controller.current===current)controller.current=null;};
  },[port]);
  useEffect(()=>{controller.current?.setEnabled(enabled);},[enabled]);
  useEffect(()=>{controller.current?.setOffline(offline);},[offline]);
  return <div data-traffic-state={state} className={`absolute z-30 max-w-[220px] ${navigation?'bottom-4 left-3':'bottom-20 right-3'}`}>
    <button type="button" aria-label="Mostrar trânsito ao vivo" aria-pressed={enabled}
      onClick={()=>setEnabled(value=>!value)}
      className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-gray-200/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg dark:border-slate-600 dark:bg-gray-700/95 dark:text-slate-100">
      <CarFront size={17}/><span role="status" aria-live="polite">{messages[state]}</span>
    </button>
    {enabled&&state==='live'&&<div aria-label="Legenda do trânsito" className="mt-1 rounded-lg bg-white/95 px-2 py-1.5 text-[10px] text-slate-700 shadow dark:bg-gray-800/95 dark:text-slate-200">
      <div className="flex items-center justify-between gap-3">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500"/>Livre</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-yellow-400"/>Lento</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500"/>Intenso</span>
      </div>
      <span className="mt-1 block">Cinza: sem dados · © TomTom</span>
    </div>}
  </div>;
}

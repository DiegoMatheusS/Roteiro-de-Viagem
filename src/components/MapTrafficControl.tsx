import React,{useEffect,useRef,useState} from 'react';
import {CarFront} from 'lucide-react';
import {createTrafficFlowController,type TrafficMapPort,type TrafficState} from '../services/trafficFlow';

/** Congestionamento grave (vermelho) faz parte do mapa.
 * O botão, quando ativo, mostra TODOS os níveis do trânsito ao vivo. */
export function MapTrafficControl({port,offline=false,navigation=false,location}:{
  port:TrafficMapPort|null;offline?:boolean;navigation?:boolean;location?:[number,number]|null;
}){
  const [fullTraffic,setFullTraffic]=useState(false),[state,setState]=useState<TrafficState>('off');
  const controller=useRef<ReturnType<typeof createTrafficFlowController>|null>(null);
  useEffect(()=>{
    if(!port)return;
    const current=createTrafficFlowController({
      port,onState:setState,offline,initialEnabled:true,
      initialStyle:fullTraffic?'light':'red',location
    });
    controller.current=current;
    return()=>{current.destroy();if(controller.current===current)controller.current=null;};
  },[port]);
  useEffect(()=>{controller.current?.setStyle(fullTraffic?'light':'red');},[fullTraffic]);
  useEffect(()=>{controller.current?.setOffline(offline);},[offline]);
  useEffect(()=>{controller.current?.setLocation(location??null);},[location?.[0],location?.[1]]);
  return <div data-traffic-state={state} data-traffic-control
    data-traffic-enabled={fullTraffic} data-traffic-mode={fullTraffic?'full':'red-only'}
    className={`absolute z-30 ${navigation?'right-6 bottom-[calc(var(--rdv-nav-panel-height)+159px)]':'right-5 bottom-[386px] rdv-map-traffic-control'}`}>
    <button type="button"
      aria-label={fullTraffic?'Ocultar trânsito completo':'Mostrar trânsito'}
      aria-pressed={fullTraffic}
      title={fullTraffic?'Voltar a mostrar só congestionamentos vermelhos':'Mostrar trânsito completo: verde, amarelo e vermelho'}
      onClick={()=>setFullTraffic(value=>!value)}
      className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_4px_18px_rgba(15,23,42,.16)] transition-colors active:scale-95 ${fullTraffic
        ?'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-200/65 shadow-[0_4px_18px_rgba(37,99,235,.3)]'
        :'border-slate-200 bg-white text-blue-700'}`}>
      <CarFront size={23} strokeWidth={2.1} aria-hidden="true"/>
    </button>
  </div>;
}

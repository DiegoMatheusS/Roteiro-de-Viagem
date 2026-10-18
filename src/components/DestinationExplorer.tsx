import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import type { TripPlan, Vehicle } from '../types';
import type { LocationSelection } from '../types/itinerary';
import { fetchRouteChoices, choiceLabel, choiceToTrip, type VerifiedRouteChoice } from '../services/routeChoices';
import { requestTolls, tollBudgetPatch, type TollResult } from '../services/routeConditions';
import {GUEST_NAVIGATION_VEHICLE} from '../services/guestNavigationVehicle';

interface DestinationExplorerProps {
  target: LocationSelection;
  vehicle: Vehicle | null;
  gpsAvailable: boolean;
  getOrigin: () => Promise<[number,number]>;
  onMapRoute: (origin: [number,number], options:VerifiedRouteChoice[], selectedId:string) => void;
  selectedRouteId?:string;
  onStartTrip: (trip:TripPlan) => void;
  onClose: () => void;
}
export function DestinationExplorer({target,vehicle,gpsAvailable,getOrigin,onMapRoute,onStartTrip,onClose,selectedRouteId}:DestinationExplorerProps) {
  const [routes,setRoutes] = useState<VerifiedRouteChoice[]>([]);
  const [selected,setSelected] = useState(0);
  const [origin,setOrigin] = useState<[number,number]|null>(null);
  const [busy,setBusy] = useState(false);
  const initialAttempt=useRef(false);
  const busyRef=useRef(false);
  const activeRef=useRef(false);
  const routeRequest=useRef<AbortController|null>(null);
  useEffect(()=>{
    activeRef.current=true;
    return ()=>{activeRef.current=false;routeRequest.current?.abort();};
  },[]);
  const [error,setError] = useState('');
  const [tollChecks,setTollChecks] = useState<Record<string,TollResult>>({});
  useEffect(()=>{
    if(!selectedRouteId)return;
    const index=routes.findIndex(route=>route.id===selectedRouteId);
    if(index!==-1)setSelected(index);
  },[selectedRouteId,routes]);
  // Confere os pedágios da opção selecionada sem afirmar ausência de cobrança quando os dados faltam.
  useEffect(() => {
    const choice=routes[selected];
    if(!vehicle || !origin || !target.coords || !choice || tollChecks[choice.id])return;
    const controller=new AbortController();
    const trip=choiceToTrip(choice,vehicle,origin,{name:target.name,coords:target.coords});
    void requestTolls(trip,vehicle.type,controller.signal).then(result=>{
      if(!controller.signal.aborted)setTollChecks(previous=>({...previous,[choice.id]:result}));
    }).catch(()=>{ /* consulta opcional: situação permanece não verificada */ });
    return ()=>controller.abort();
  },[routes,selected,origin,vehicle?.id,target.coords?.[0],target.coords?.[1]]);
  const loadRoutes = async ():Promise<{choices:VerifiedRouteChoice[];position:[number,number]}|null> => {
    if (!target.coords || busyRef.current || !activeRef.current) return null;
    busyRef.current=true;
    const controller=new AbortController();
    routeRequest.current=controller;
    setBusy(true);setError('');
    try {
      const position=await getOrigin();
      // A GPS read can complete after the user changes/closes the destination.
      if(controller.signal.aborted || !activeRef.current)return null;
      const choices=await fetchRouteChoices(position,target.coords,controller.signal);
      if(controller.signal.aborted || !activeRef.current)return null;
      if(!choices.length)throw new Error('Nenhuma rota rodoviária encontrada para esse destino.');
      setRoutes(choices);setSelected(0);setOrigin(position);setTollChecks({});
      onMapRoute(position,choices,choices[0].id);
      return {choices,position};
    } catch(e) {
      if(!controller.signal.aborted && activeRef.current)setError((e as Error).message);
      return null;
    } finally {
      if(routeRequest.current===controller)routeRequest.current=null;
      busyRef.current=false;
      if(activeRef.current)setBusy(false);
    }
  };
  // A busca direta calcula automaticamente quando o GPS estiver pronto.
  // Não disputa leituras de geolocalização enquanto o rastreador inicia:
  // na tela Mapa isso poderia esgotar o timeout antes de consultar rotas.
  useEffect(()=>{
    if(!gpsAvailable || initialAttempt.current)return;
    initialAttempt.current=true;
    void loadRoutes();
  },[gpsAvailable]);
  const depart = async () => {
    if(busyRef.current || !activeRef.current)return;
    if(!target.coords){setError('O destino está sem coordenadas. Pesquise novamente.');return;}
    // O primeiro toque também inicia a navegação quando a lista ainda não foi calculada.
    const result=routes.length && origin ? {choices:routes,position:origin} : await loadRoutes();
    if(!result || !activeRef.current)return;
    const choice=result.choices[Math.min(selected,result.choices.length-1)];
    if(!choice){setError('Não foi possível preparar a rota. Tente novamente.');return;}
    setError('');
    const trip=choiceToTrip(choice,vehicle || GUEST_NAVIGATION_VEHICLE,result.position,{name:target.name,coords:target.coords});
    const verified=tollChecks[choice.id];
    onStartTrip(verified ? {...trip,...tollBudgetPatch(trip,verified)} : trip);
  };
  const closeExplorer=()=>{activeRef.current=false;routeRequest.current?.abort();onClose();};
  return <section aria-label="Destino no mapa" className="absolute bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl rounded-t-[26px] shadow-[0_-16px_46px_#0f172a24] border-t border-slate-100 max-h-[49dvh] flex flex-col rdv-route-sheet">
    <div className="h-7 shrink-0 flex justify-center items-center"><span className="h-1.5 w-12 bg-slate-300 rounded-full"/></div>
    <div className="overflow-y-auto w-full max-w-xl mx-auto px-4 pb-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-[15px] bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><MapPin size={24}/></span>
        <div className="flex-1 min-w-0"><p className="text-[10px] font-bold uppercase text-slate-500">Destino localizado no mapa</p>
          <h2 className="text-[19px] font-bold tracking-tight truncate">{target.name}</h2>
          {target.address && <p className="text-xs text-slate-500 truncate">{target.address}</p>}
        </div>
        <button type="button" aria-label="Sair da visualização do destino" onClick={closeExplorer} className="p-2.5 bg-slate-100 text-slate-600 rounded-full active:scale-95 transition-transform"><X size={18}/></button>
      </div>
      <button type="button" disabled={busy} onClick={()=>void depart()}
        className="w-full min-h-14 rounded-2xl bg-[#2167e8] text-white font-bold text-[15px] flex items-center justify-center gap-2 shadow-[0_8px_20px_#2563eb45] active:scale-[.98] transition-transform disabled:opacity-60">
        <Navigation size={21}/>{busy?'Preparando sua navegação...':routes.length?'Iniciar rota selecionada':'Calcular e iniciar rota'}
      </button>
      {error && <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>}

      <section aria-label="Fazer viagem" className="space-y-2">
        <div className="flex justify-between items-center gap-2"><h3 className="text-base font-bold">Rotas disponíveis</h3>
          <button type="button" disabled={busy} onClick={()=>void loadRoutes()} className="text-xs text-blue-700 font-bold">{routes.length?'Atualizar rotas':'Mostrar rotas'}</button></div>
        {!routes.length && !error && <p className="text-xs text-slate-500">{busy ? 'Calculando rotas a partir do GPS...' : 'Destino marcado no mapa. Toque em Mostrar rotas para tentar novamente.'}</p>}
        {routes.map((route,index)=><button key={route.id} type="button" aria-pressed={index===selected}
          onClick={()=>{setSelected(index);if(origin)onMapRoute(origin,routes,route.id);}}
          className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-200 active:scale-[.99] ${index===selected?'border-blue-500 bg-blue-50 shadow-[0_5px_16px_#2563eb20]':'border-slate-200 bg-white hover:border-blue-200'}`}>
          <div className="flex justify-between gap-2"><strong className="text-[13px]">{choiceLabel(route,index)}{index===0 && route.kind!=='fast' && route.kind!=='alternative' ? ' · sugerida pelo Rolê' : ''}</strong><strong className="text-xs text-blue-700">{route.durationMinutes} min</strong></div>
          <p className="text-[11px] text-slate-600 mt-1">{route.distanceKm.toFixed(1)} km{route.scenicStop ? ` · Via ${route.scenicStop.name}` : ''}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {tollChecks[route.id]?.tolls.length
              ? `Com pedágio · ${tollChecks[route.id].knownCost.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} conhecido`
              : 'Pedágios: não confirmados'} · Trânsito ao vivo: indisponível
          </p>
        </button>)}
        {!gpsAvailable && <p className="text-xs text-amber-800">Ative o GPS para calcular as rotas a partir da sua localização.</p>}
      </section>
    </div>
  </section>;
}

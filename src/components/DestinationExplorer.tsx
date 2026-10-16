import React, { useState } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import type { TripPlan, Vehicle } from '../types';
import type { LocationSelection } from '../types/itinerary';
import { TOURIST_PLACE_KINDS } from '../types/admin';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { fetchRouteChoices, choiceLabel, choiceToTrip, type VerifiedRouteChoice } from '../services/routeChoices';

interface DestinationExplorerProps {
  target: LocationSelection;
  vehicle: Vehicle | null;
  gpsAvailable: boolean;
  getOrigin: () => Promise<[number,number]>;
  onMapRoute: (origin: [number,number], path:[number,number][]) => void;
  onStartTrip: (trip:TripPlan) => void;
  onClose: () => void;
}
export function DestinationExplorer({target,vehicle,gpsAvailable,getOrigin,onMapRoute,onStartTrip,onClose}:DestinationExplorerProps) {
  const [routes,setRoutes] = useState<VerifiedRouteChoice[]>([]);
  const [selected,setSelected] = useState(0);
  const [origin,setOrigin] = useState<[number,number]|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const nearby = useNearbyPlaces(target.coords ? [target.coords] : [],Boolean(target.coords));
  const tips = nearby.filter(place=>(TOURIST_PLACE_KINDS as readonly string[]).includes(place.kind)).slice(0,3);
  const loadRoutes = async () => {
    if (!target.coords || busy) return;
    setBusy(true);setError('');
    try {
      const position=await getOrigin();
      const choices=await fetchRouteChoices(position,target.coords);
      if(!choices.length)throw new Error('Nenhuma rota rodoviária encontrada para esse destino.');
      setRoutes(choices);setSelected(0);setOrigin(position);
      onMapRoute(position,choices[0].routePath);
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  };
  const depart = () => {
    if (!routes.length || !origin) {void loadRoutes();return;}
    if(!vehicle || !target.coords){setError('Cadastre um veículo no Perfil → Minha Garagem antes de navegar.');return;}
    onStartTrip(choiceToTrip(routes[selected],vehicle,origin,{name:target.name,coords:target.coords}));
  };
  return <section aria-label="Destino no mapa" className="absolute bottom-0 inset-x-0 z-50 bg-white rounded-t-[28px] shadow-[0_-8px_28px_#0f172a20] border-t border-slate-100 max-h-[65dvh] flex flex-col">
    <div className="h-7 shrink-0 flex justify-center items-center"><span className="h-1.5 w-12 bg-slate-300 rounded-full"/></div>
    <div className="overflow-y-auto w-full max-w-xl mx-auto px-4 pb-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><MapPin size={24}/></span>
        <div className="flex-1 min-w-0"><p className="text-[10px] font-bold uppercase text-slate-500">Destino localizado no mapa</p>
          <h2 className="text-[16px] font-extrabold truncate">{target.name}</h2>
          {target.address && <p className="text-xs text-slate-500 truncate">{target.address}</p>}
        </div>
        <button type="button" aria-label="Sair da visualização do destino" onClick={onClose} className="p-2 bg-slate-100 text-slate-600 rounded-full"><X size={18}/></button>
      </div>
      <button type="button" disabled={busy} onClick={depart}
        className="w-full h-12 rounded-2xl bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
        <Navigation size={19}/>{busy?'Calculando rotas...':'Sair agora'}
      </button>
      <section className="space-y-2"><h3 className="text-sm font-extrabold">Dicas de viagem</h3>
        <p className="text-xs text-slate-600">Confira a previsão do tempo, pedágios e condições das estradas antes de sair.</p>
        {tips.map(place=><p key={place.id} className="text-xs px-3 py-2 bg-emerald-50 text-emerald-900 rounded-xl">{place.name} · atração cadastrada próxima</p>)}
      </section>
      <section aria-label="Fazer viagem" className="space-y-2">
        <div className="flex justify-between items-center gap-2"><h3 className="text-sm font-extrabold">Fazer viagem</h3>
          <button type="button" disabled={busy} onClick={()=>void loadRoutes()} className="text-xs text-blue-700 font-bold">{routes.length?'Atualizar rotas':'Mostrar rotas'}</button></div>
        {!routes.length && <p className="text-xs text-slate-500">Confira os caminhos disponíveis desde o seu GPS. O destino já está no mapa.</p>}
        {routes.map((route,index)=><button key={route.id} type="button" aria-pressed={index===selected}
          onClick={()=>{setSelected(index);if(origin)onMapRoute(origin,route.routePath);}}
          className={`w-full text-left p-3 rounded-2xl border ${index===selected?'border-blue-500 bg-blue-50':'border-slate-200 bg-white'}`}>
          <div className="flex justify-between gap-2"><strong className="text-[13px]">{choiceLabel(route,index)}</strong><strong className="text-xs text-blue-700">{route.durationMinutes} min</strong></div>
          <p className="text-[11px] text-slate-600 mt-1">{route.distanceKm.toFixed(1)} km{route.scenicStop ? ` · Via ${route.scenicStop.name}` : ''}</p>
          <p className="text-[10px] text-slate-500 mt-1">Pedágios: verificar · Trânsito em tempo real: indisponível</p>
        </button>)}
        {routes.length>0 && <p className="text-[11px] text-slate-500">Toque em uma rota para ver o caminho azul no mapa. “Sair agora” inicia a selecionada.</p>}
        {!gpsAvailable && <p className="text-xs text-amber-800">Ative o GPS para calcular as rotas a partir da sua localização.</p>}
        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl">{error}</p>}
      </section>
    </div>
  </section>;
}

import React from 'react';
import {CloudRain,Fuel,RefreshCw} from 'lucide-react';
import type { TripPlan } from '../types';

export interface ConditionsStatus { busy: boolean; weatherError: string; tollError: string; refresh: () => void }

export function RouteConditionsStatus({trip,conditions}: {trip:TripPlan;conditions:ConditionsStatus}) {
  const weatherLabel=trip.weatherUpdatedAt
    ? `Previsão · ${new Date(trip.weatherUpdatedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`
    : 'Previsão não disponível';
  const tollLabel=trip.tollsStatus==='unknown'
    ? 'Tarifa desconhecida'
    : `R$ ${trip.knownTollsCost.toFixed(2)} verificados`;
  return <div className="space-y-3 rounded-[18px] border border-slate-200/90 bg-white p-3 text-xs text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,.06)]" aria-label="Condições da rota">
    <div className="flex items-start gap-2">
      <CloudRain size={18} className="mt-0.5 shrink-0 text-blue-600"/>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{weatherLabel}</p>
        {conditions.weatherError && <p role="status" className="mt-1 text-amber-800">Clima: {conditions.weatherError}</p>}
      </div>
    </div>
    <div className="flex items-start gap-2">
      <Fuel size={18} className="mt-0.5 shrink-0 text-emerald-700"/>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">Pedágios: {tollLabel}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Cobertura sujeita à disponibilidade das tarifas.</p>
        {conditions.tollError && <p role="status" className="mt-1 text-amber-800">{conditions.tollError}</p>}
      </div>
    </div>
    <button type="button" onClick={conditions.refresh} disabled={conditions.busy}
      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 disabled:opacity-60">
      <RefreshCw size={15} className={conditions.busy?'animate-spin':''}/>
      {conditions.busy?'Atualizando clima e tarifas...':'Atualizar clima e pedágios'}
    </button>
  </div>;
}

import React from 'react';
import type { TripPlan } from '../types';
export interface ConditionsStatus { busy: boolean; weatherError: string; tollError: string; refresh: () => void }
export function RouteConditionsStatus({trip,conditions}: {trip:TripPlan;conditions:ConditionsStatus}) {
  return <div className="bg-white/95 border rounded-xl p-2 text-[10px] space-y-1" aria-label="Condições da rota">
    <p>{conditions.busy ? 'Atualizando clima e tarifas...' : trip.weatherUpdatedAt ? `Previsão · ${new Date(trip.weatherUpdatedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : 'Previsão não disponível'}</p>
    {conditions.weatherError && <p role="status" className="text-amber-800">Clima: {conditions.weatherError}</p>}{conditions.tollError && <p role="status" className="text-amber-800">{conditions.tollError}</p>}
    <p>Pedágios: {trip.tollsStatus === 'unknown' ? 'sem tarifa informada' : `R$ ${trip.knownTollsCost.toFixed(2)} conhecidos`} · cobertura parcial</p>
    <button onClick={conditions.refresh} disabled={conditions.busy} className="font-bold underline text-emerald-700">Atualizar clima e pedágios</button>
  </div>;
}

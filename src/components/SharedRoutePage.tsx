import React, { useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import type { SharedRoute } from '../types/sharedRoute';
import { InteractiveMap } from './InteractiveMap';

export default function SharedRoutePage() {
  const [route, setRoute] = useState<SharedRoute | null>(null), [error, setError] = useState('');
  const id = window.location.hash.slice('#roteiro='.length);
  useEffect(() => { fuelApi<SharedRoute>(`/routes/share/${encodeURIComponent(id)}`).then(setRoute).catch(error => setError(error.message)); }, [id]);
  return <main className="min-h-screen bg-slate-50 p-5 text-slate-900 font-sans"><section className="max-w-3xl mx-auto bg-white rounded-3xl border p-5 space-y-4"><a href="/" className="text-emerald-700 text-sm font-bold">Roteiro de Viagem</a><h1 className="text-xl font-bold">{route?.title || 'Roteiro compartilhado'}</h1>{error && <p role="alert" className="text-rose-700 text-sm">{error}</p>}{!route && !error && <p>Carregando roteiro...</p>}{route && <><p className="text-sm">{route.originName} → {route.destinationName}</p><p className="text-sm font-bold">{route.distanceKm} km · {Math.floor(route.durationMinutes / 60)}h{route.durationMinutes % 60}min · {route.stops.length} paradas</p>{route.protectedOrigin && <p className="text-xs text-slate-500">A localização de partida foi aproximada para preservar a privacidade.</p>}{!route.routingSource && <p className="text-xs text-amber-800">Prévia ilustrativa do planejamento original.</p>}
      <div className="h-80 rounded-2xl overflow-hidden"><InteractiveMap originCoords={route.originCoords} destinationCoords={route.destinationCoords} originLabel={route.originName} destinationLabel={route.destinationName} routePath={route.routePath} showFuelStations={false} stops={route.stops.map((stop, index) => ({ id: String(index), name: stop.name, category: stop.category as any, description: stop.description, lat: stop.coords[0], lng: stop.coords[1], recommendedMinutes: stop.stayMinutes, type: stop.type }))} /></div>
      <h2 className="font-bold">Sequência das paradas</h2>{route.stops.map((stop, index) => <article key={index} className="bg-slate-50 rounded-xl p-3 space-y-1"><strong className="text-sm">{index + 1}. {stop.name}</strong><p className="text-xs text-slate-500">{stop.type === 'mandatory' ? 'Obrigatória · escolhida pelo viajante' : 'Sugestão aceita'} · Permanência: {stop.stayMinutes} min</p><p className="text-xs">{stop.description}</p></article>)}<p className="text-xs text-slate-500">Este link compartilha o planejamento, sem localização ao vivo.</p>
    </>}</section></main>;
}

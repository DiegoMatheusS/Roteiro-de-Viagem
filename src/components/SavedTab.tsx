import React, { useState } from 'react';
import { TripPlan, Vehicle } from '../types';
import { storageService } from '../services/storageService';
import { 
  Bookmark, 
  MapPin, 
  Play, 
  Share2, 
  Trash2, 
  Users, 
  CheckCircle, 
  Calendar, 
  Clock, 
  Navigation,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface SavedTabProps {
  trips: TripPlan[];
  vehicles: Vehicle[];
  onStartTrip: (trip: TripPlan) => void;
  onOpenShareModal: (trip: TripPlan) => void;
  onDeleteTrip: (tripId: string) => void;
  onOpenConvoyModal: (trip: TripPlan) => void;
  onCreateTrip?: () => void;
}

export const SavedTab: React.FC<SavedTabProps> = ({
  trips,
  vehicles,
  onStartTrip,
  onOpenShareModal,
  onDeleteTrip,
  onOpenConvoyModal, onCreateTrip
}) => {
  const [filter, setFilter] = useState<'all' | 'planned' | 'completed'>('completed');

  const filteredTrips = trips.filter(t => {
    if (filter === 'planned') return t.status === 'planned';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const completedTrips = trips.filter(t=>t.status === 'completed');
  const completedKm = completedTrips.reduce((sum,t)=>sum+(t.actualDistanceKm||t.trackedDistanceKm||0),0);
  const plannedTrips = trips.filter(t=>t.status === 'planned');
  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    return v ? (v.nickname || `${v.brand} ${v.model}`) : 'Veículo não definido';
  };

  return (
    <div className="rdv-figma-page min-h-[calc(100vh-4rem)] pb-24 bg-[#f4f6f9] overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 pt-[72px] pb-5">
        <h1 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>Minhas viagens</span>
        </h1>

        {/* Filter Segmented Controls */}
        <div className="flex items-center gap-2 mt-5 max-w-sm">
          {[
            { id: 'completed', label: 'Concluídas' },
            { id: 'planned', label: 'Planejadas' },
            { id: 'all', label: 'Todas' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`rdv-figma-tab flex-1 py-2 px-2 text-xs font-semibold border transition-all ${
                filter === f.id
                  ? 'bg-blue-50 text-blue-600 border-blue-500'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-5">
        <div className="grid grid-cols-3 gap-3 text-center pb-3" aria-label="Resumo de viagens">
          <div><strong className="block text-[18px] text-slate-800">{Math.round(completedKm)} km</strong><span className="text-[11px] text-slate-500">percorridos</span></div>
          <div><strong className="block text-[18px] text-slate-800">{completedTrips.length}</strong><span className="text-[11px] text-slate-500">viagens</span></div>
          <div><strong className="block text-[18px] text-slate-800">{plannedTrips.length}</strong><span className="text-[11px] text-slate-500">rotas salvas</span></div>
        </div>
      </div>
      {/* Histórico real — nenhum exemplo artificial é inserido. */}
      <div className="max-w-2xl mx-auto px-5 pb-5 space-y-4">
        {filteredTrips.length === 0 ? (
          <div className="min-h-[56dvh] flex flex-col items-center justify-center text-center px-5">
            <div className="rdv-figma-empty-icon w-32 h-32 rounded-full flex items-center justify-center mb-5">
              <Navigation size={53} strokeWidth={1.5}/>
            </div>
            <h2 className="text-[20px] font-bold text-slate-800 max-w-[260px] leading-snug">
              {filter==='completed'?'Seu primeiro rolê começa aqui':filter==='planned'?'Nenhum rolê planejado':'Seus rolês aparecem aqui'}
            </h2>
            <p className="text-[13px] text-slate-500 mt-3 max-w-[275px] leading-relaxed">
              Escolha km ou horas e saia para explorar. Suas viagens concluídas aparecem aqui.
            </p>
            <button type="button" disabled={!onCreateTrip} onClick={onCreateTrip}
              className="rdv-figma-primary mt-6 w-full max-w-[270px] min-h-[48px] text-sm font-semibold disabled:opacity-60">
              Criar meu primeiro rolê
            </button>
            <p className="text-xs text-blue-600 mt-3">Explore passeios ou encontre um destino no mapa.</p>
            <span className="text-[10px] text-slate-400 mt-2">Só viagens concluídas somam quilômetros.</span>
          </div>
        ) : (
          filteredTrips.map(trip => {
            const isCompleted = trip.status === 'completed';
                const isCancelled = trip.status === 'cancelled';
            const isGpsVerified = trip.actualTraveledVerifiedGps;

            return (
              <div
                key={trip.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs hover:border-slate-300 transition-all space-y-4"
              >
                {/* Title & Status badge */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isCompleted ? 'Viagem Realizada' : isCancelled ? 'Encerrada' : trip.status === 'in_progress' ? 'Em andamento' : 'Planejada'}
                      </span>
                      {isCompleted && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isGpsVerified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isGpsVerified ? '✓ GPS Verificado' : 'Informado manualmente'}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">
                      {trip.title}
                    </h3>
                  </div>

                  <button
                    onClick={() => onDeleteTrip(trip.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Trajectory */}
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{trip.originName.split('-')[0].trim()}</span>
                  <span className="text-slate-300">➡️</span>
                  <span className="truncate font-semibold text-slate-800">{trip.destinationName.split('-')[0].trim()}</span>
                </div>

                {/* Metrics Row */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">DISTÂNCIA</span>
                    <strong className="text-slate-900 font-bold">{trip.distanceKm} km</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">DURAÇÃO</span>
                    <strong className="text-slate-900 font-bold">
                      {Math.floor(trip.durationMinutes / 60)}h{trip.durationMinutes % 60}m
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">VEÍCULO</span>
                    <strong className="text-slate-900 font-bold truncate block">
                      {getVehicleName(trip.vehicleId)}
                    </strong>
                  </div>
                </div>

                {trip.fuelPriceSource && <p className="text-[11px] text-slate-500">Combustível: {trip.fuelPriceSource.stationName} · preço visto em {new Date(trip.fuelPriceSource.observedAt).toLocaleString('pt-BR')}{Date.now() - Date.parse(trip.fuelPriceSource.observedAt) > 72 * 3600000 ? ' · Preço desatualizado: confira novamente antes de viajar.' : ''}</p>}
                {trip.fuelPricePerLiter <= 0 && <p className="text-[11px] text-amber-800">Estimativa parcial: preço do combustível ainda não informado.</p>}

                {trip.tollsStatus !== 'available' && <p className="text-[11px] text-amber-800">Orçamento parcial: tarifas de pedágio não informadas.</p>}
                {trip.manualStops?.length ? <p className="text-[11px] text-emerald-700">{trip.manualStops.length} paradas obrigatórias preservadas.</p> : null}

                {/* Review if completed */}
                {trip.userReview && (
                  <div className="p-3 bg-emerald-50/50 rounded-xl text-xs text-slate-700 italic border border-emerald-100">
                    "{trip.userReview}"
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenShareModal(trip)}
                      className="py-2 px-3 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Compartilhar</span>
                    </button>

                    <button
                      onClick={() => onOpenConvoyModal(trip)}
                      className="py-2 px-3 rounded-xl border border-slate-200 hover:border-violet-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5 text-violet-600" />
                      <span>Comboio</span>
                    </button>
                  </div>

                  {!isCompleted && (
                    <button
                      onClick={() => onStartTrip(trip)}
                      className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>{isCancelled ? 'Viajar novamente' : trip.status === 'in_progress' ? 'Retomar mapa' : 'Iniciar Agora'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


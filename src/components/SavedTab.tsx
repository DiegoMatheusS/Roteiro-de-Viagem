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
  MapPinned,
  ShieldCheck
} from 'lucide-react';

interface SavedTabProps {
  trips: TripPlan[];
  vehicles: Vehicle[];
  onStartTrip: (trip: TripPlan) => void;
  onOpenShareModal: (trip: TripPlan) => void;
  onPreviewTrip: (trip: TripPlan) => void;
  onDeleteTrip: (tripId: string) => void;
  onOpenConvoyModal: (trip: TripPlan) => void;
}

export const SavedTab: React.FC<SavedTabProps> = ({
  trips,
  vehicles,
  onStartTrip,
  onOpenShareModal,
  onPreviewTrip,
  onDeleteTrip,
  onOpenConvoyModal
}) => {
  const [filter, setFilter] = useState<'all' | 'planned' | 'completed'>('all');

  const filteredTrips = trips.filter(t => {
    if (filter === 'planned') return t.status === 'planned';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    return v ? (v.nickname || `${v.brand} ${v.model}`) : 'Veículo não definido';
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24 bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <h1 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-emerald-600" />
          <span>Minhas Viagens</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Histórico de viagens realizadas, roteiros planejados e passeios salvos.
        </p>

        {/* Filter Segmented Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mt-4 max-w-sm">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'planned', label: 'Planejadas' },
            { id: 'completed', label: 'Concluídas (Histórico)' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === f.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trips list */}
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Notice on tier km rule (Requirement #2) */}
        <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <strong>Regra de Pontuação:</strong> Somente viagens efetivamente realizadas e concluídas somam quilometragem ao seu Nível do Viajante. Viagens apenas planejadas não contam pontos.
          </span>
        </div>

        {filteredTrips.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
            <Bookmark className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold">Nenhuma viagem encontrada neste filtro.</p>
            <p className="text-xs text-slate-400 mt-1">Planeje uma nova rota ou conclua um passeio para registrar seu histórico.</p>
          </div>
        ) : (
          filteredTrips.map(trip => {
            const isCompleted = trip.status === 'completed';
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
                        {isCompleted ? 'Viagem Realizada' : 'Planejada'}
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

                {trip.tollsStatus === 'unknown' && <p className="text-[11px] text-amber-800">Orçamento parcial: tarifas de pedágio não informadas.</p>}
                {trip.manualStops?.length ? <p className="text-[11px] text-emerald-700">{trip.manualStops.length} paradas obrigatórias preservadas.</p> : null}

                {/* Review if completed */}
                {trip.userReview && (
                  <div className="p-3 bg-emerald-50/50 rounded-xl text-xs text-slate-700 italic border border-emerald-100">
                    "{trip.userReview}"
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button" onClick={() => onPreviewTrip(trip)}
                      className="py-2 px-3 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                      <MapPinned className="w-3.5 h-3.5" /> Ver no mapa
                    </button>
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
                      <span>Iniciar Agora</span>
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

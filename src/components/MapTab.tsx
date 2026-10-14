import React, { useState } from 'react';
import { Vehicle, TripPlan } from '../types';
import { InteractiveMap } from './InteractiveMap';
import { 
  Navigation, 
  MapPin, 
  Crosshair, 
  Layers, 
  CloudRain, 
  Fuel, 
  Utensils, 
  Mountain, 
  AlertOctagon, 
  Home, 
  Compass, 
  Eye, 
  Sparkles,
  Share2,
  Users,
  Play,
  CheckCircle,
  Clock,
  Gauge,
  X,
  ArrowLeft
} from 'lucide-react';

interface MapTabProps {
  currentVehicle: Vehicle | null;
  activeTrip: TripPlan | null;
  plannedTrip?: TripPlan | null;
  onClosePreview?: () => void;
  onResumeNavigation?: () => void;
  onEndTrip?: () => void;
  activeConvoyId?: string | null;
  onOpenRoutePlanner: (origin: string, dest: string, coords?: [number, number], originCoords?: [number, number]) => void;
  onNavigateHome: () => void;
  onOpenSos: () => void;
  onStartTrip?: (trip: TripPlan) => void;
  onOpenShareModal?: (trip: TripPlan) => void;
  onOpenConvoyModal?: (trip: TripPlan) => void;
  onEndConvoy?: () => void;
}

export const MapTab: React.FC<MapTabProps> = ({
  currentVehicle,
  activeTrip,
  plannedTrip,
  onClosePreview,
  onResumeNavigation,
  onEndTrip,
  activeConvoyId,
  onOpenRoutePlanner,
  onNavigateHome,
  onOpenSos,
  onStartTrip,
  onOpenShareModal,
  onOpenConvoyModal,
  onEndConvoy
}) => {
  const [showRainRadar, setShowRainRadar] = useState(false);
  const [showStops, setShowStops] = useState(true);
  const [showGasStations, setShowGasStations] = useState(true);
  const [showRestaurants, setShowRestaurants] = useState(true);
  const [showHomeConfirmation, setShowHomeConfirmation] = useState(false);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);

  // Only display actual planned/saved routes. Never show an illustrative trip as the user's journey.
  const tripToDisplay = activeTrip || plannedTrip || null;
  const activeStops = (tripToDisplay?.stops || []).filter(stop => {
    if (stop.category === 'mirante') return showStops;
    if (stop.category === 'posto') return showGasStations;
    if (stop.category === 'restaurante') return showRestaurants;
    return true;
  });

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      {/* 100% IMMERSIVE FULL-SCREEN MAP CANVAS */}
      <InteractiveMap
        originCoords={tripToDisplay?.originCoords}
        destinationCoords={tripToDisplay?.destinationCoords}
        originLabel={tripToDisplay?.originName}
        destinationLabel={tripToDisplay?.destinationName}
        routePath={tripToDisplay?.routePath || []}
        routeModality={tripToDisplay?.modality}
        stops={activeStops}
        showRainLayer={showRainRadar}
        showFuelStations={showGasStations}
        className="w-full h-full"
      />

      {/* Route controls for the selected planned or active trip. */}
      {tripToDisplay && (
      <div className="absolute top-4 left-4 z-30 pointer-events-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 sm:p-3.5 max-w-[280px] sm:max-w-[320px] space-y-2.5 backdrop-blur-md">
          {/* Header & Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${activeTrip ? 'bg-emerald-500 animate-ping' : 'bg-blue-500'}`} />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  {activeTrip ? 'Em Andamento' : 'Viagem Programada'}
                </span>
              </div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug truncate">
                {tripToDisplay.destinationName.split('-')[0].trim()}
              </h3>
              <p className="text-[10px] text-slate-500 font-medium truncate">
                Partida: {tripToDisplay.originName.split('-')[0].trim()}
              </p>
            </div>

            {/* Vehicle & Metrics */}
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-600 font-bold block">
                {currentVehicle?.type === 'motorcycle' ? '🏍️' : '🚗'} {currentVehicle?.nickname || currentVehicle?.model || 'Veículo'}
              </span>
              <span className="text-[11px] font-extrabold text-emerald-700 block">
                {tripToDisplay.distanceKm} km
              </span>
              <span className="text-[10px] text-slate-400 font-medium block">
                ~{Math.round(tripToDisplay.durationMinutes / 60)}h{tripToDisplay.durationMinutes % 60}m
              </span>
            </div>
          </div>

          {/* Controls for route preview or active journey — separate closing the view from completion. */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button type="button"
              onClick={() => onOpenRoutePlanner(tripToDisplay.originName, tripToDisplay.destinationName, tripToDisplay.destinationCoords, tripToDisplay.originCoords)}
              className="px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-xs font-bold flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" /> Alterar rota
            </button>
            <button type="button"
              onClick={() => activeTrip ? setShowEndConfirmation(true) : onClosePreview?.()}
              className="px-2.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /> {activeTrip ? 'Encerrar viagem' : 'Encerrar prévia'}
            </button>
          </div>

          {/* Action Buttons: Compartilhar, Comboio, Iniciar Viagem - Design Branco Limpo */}
          <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
            {/* Compartilhar Rota */}
            <button
              type="button"
              onClick={() => onOpenShareModal?.(tripToDisplay)}
              className="py-1.5 px-2 rounded-xl bg-white hover:bg-slate-50 active:scale-95 border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
              title="Compartilhar roteiro"
            >
              <Share2 className="w-3 h-3 text-slate-500" />
              <span className="truncate">Compartilhar</span>
            </button>

            {/* Comboio de Viagem */}
            <button
              type="button"
              onClick={() => onOpenConvoyModal?.(tripToDisplay)}
              className={`py-1.5 px-2 rounded-xl active:scale-95 border text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${
                activeConvoyId 
                  ? 'bg-violet-50 border-violet-300 text-violet-800' 
                  : 'bg-white hover:bg-violet-50 border-slate-200 text-violet-700'
              }`}
              title="Fazer comboio com amigos"
            >
              <Users className="w-3 h-3 text-violet-600" />
              <span className="truncate">{activeConvoyId ? 'Comboio (Ativo)' : 'Comboio'}</span>
            </button>

            {/* Iniciar / Navegar Viagem - Menu Branco Limpo */}
            <button
              type="button"
              onClick={() => activeTrip ? onResumeNavigation?.() : onStartTrip?.(tripToDisplay)}
              className="py-1.5 px-2 rounded-xl bg-white hover:bg-emerald-50 active:scale-95 border border-emerald-400 text-emerald-800 text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer"
              title={activeTrip ? 'Continuar navegação' : 'Iniciar viagem no mapa'}
            >
              <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
              <span className="truncate">{activeTrip ? 'Retomar' : 'Iniciar'}</span>
            </button>
          </div>
        </div>
      </div>

      )}
      {!tripToDisplay && <div className="absolute top-4 left-4 z-30 max-w-xs bg-white/95 border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-700 shadow-lg">Nenhuma rota selecionada. Crie uma no Início ou abra uma viagem em Salvos.</div>}

      {/* TOP-RIGHT ACTIONS (Voltar pra casa com confirmação & SOS) */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Quero Voltar Pra Casa - Com Confirmação (Requirement #9) */}
        <button
          onClick={() => setShowHomeConfirmation(true)}
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 shadow-xl flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
          title="Quero voltar pra casa"
        >
          <Home className="w-5 h-5" />
        </button>

        {/* SOS button */}
        <button
          onClick={onOpenSos}
          className="px-3 h-10 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-xl flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
          title="Central SOS"
        >
          <AlertOctagon className="w-4 h-4" />
          <span>SOS</span>
        </button>
      </div>

      {/* FLOATING TOP-RIGHT LAYER TOGGLES (Chuva, Mirantes, Postos) */}
      <div className="absolute top-16 right-4 z-30 flex flex-col gap-2 pointer-events-auto">
        {/* Chuva / Radar */}
        <button
          onClick={() => setShowRainRadar(!showRainRadar)}
          className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xl backdrop-blur-md transition-all cursor-pointer ${
            showRainRadar 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
          title="Radar meteorológico e chuva"
        >
          <CloudRain className="w-4 h-4" />
          <span className="hidden sm:inline">Chuva</span>
        </button>

        {/* Mirantes */}
        <button
          onClick={() => setShowStops(!showStops)}
          className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xl backdrop-blur-md transition-all cursor-pointer ${
            showStops 
              ? 'bg-emerald-600 text-white' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
          title="Mirantes e pontos cênicos"
        >
          <Mountain className="w-4 h-4" />
          <span className="hidden sm:inline">Mirantes</span>
        </button>

        {/* Postos */}
        <button
          onClick={() => setShowGasStations(!showGasStations)}
          className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xl backdrop-blur-md transition-all cursor-pointer ${
            showGasStations 
              ? 'bg-amber-600 text-white' 
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
          title="Postos de combustível"
        >
          <Fuel className="w-4 h-4" />
          <span className="hidden sm:inline">Postos</span>
        </button>
      </div>

      {showEndConfirmation && activeTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-label="Encerrar viagem">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="font-extrabold text-slate-900">Encerrar viagem sem concluir?</h3>
            <p className="text-sm text-slate-600">A navegação será encerrada e o roteiro continuará em Salvos como planejado. Nenhuma distância ou conquista será registrada.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowEndConfirmation(false)} className="flex-1 p-2.5 rounded-xl border font-bold text-sm">Continuar viagem</button>
              <button type="button" onClick={() => { setShowEndConfirmation(false); onEndTrip?.(); }} className="flex-1 p-2.5 rounded-xl bg-rose-600 text-white font-bold text-sm">Encerrar sem concluir</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE RETORNO PRA CASA (Requirement #9) */}
      {showHomeConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in pointer-events-auto">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
              <Home className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900">
                Traçar Rota para Casa?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Deseja calcular o trajeto de retorno mais seguro e rápido para o seu endereço residencial cadastrado?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowHomeConfirmation(false)}
                className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHomeConfirmation(false);
                  onNavigateHome();
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-colors shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Sim, Ir pra Casa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

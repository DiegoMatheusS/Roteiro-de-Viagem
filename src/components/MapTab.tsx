import React, { useState } from 'react';
import { Vehicle, TripPlan, RouteStop } from '../types';
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
  Gauge
} from 'lucide-react';

interface MapTabProps {
  currentVehicle: Vehicle | null;
  activeTrip: TripPlan | null;
  activeConvoyId?: string | null;
  onOpenRoutePlanner: (origin: string, dest: string, coords?: [number, number]) => void;
  onNavigateHome: () => void;
  onOpenSos: () => void;
  onStartTrip?: (trip: TripPlan) => void;
  onOpenShareModal?: (trip: TripPlan) => void;
  onOpenConvoyModal?: (trip: TripPlan) => void;
  onEndConvoy?: () => void;
}

// Sample points of interest across the region
const MAP_EXPLORE_STOPS: RouteStop[] = [
  {
    id: 'exp-1',
    name: 'Mirante da Vista Chinesa',
    category: 'mirante',
    lat: -22.7562,
    lng: -45.5781,
    description: 'Vista exuberante de todo o Vale do Paraíba na Serra da Mantiqueira.',
    recommendedMinutes: 25,
    rating: 4.9
  },
  {
    id: 'exp-2',
    name: 'Posto Graal 125 (Rod. Ayrton Senna)',
    category: 'posto',
    lat: -23.2237,
    lng: -45.9009,
    description: 'Ponto de encontro tradicional de motociclistas, café e combustível de qualidade.',
    recommendedMinutes: 20,
    rating: 4.7
  },
  {
    id: 'exp-3',
    name: 'Restaurante & Empório da Serra',
    category: 'restaurante',
    lat: -22.8200,
    lng: -45.6500,
    description: 'Comida caseira no fogão a lenha com vista panorâmica.',
    recommendedMinutes: 50,
    rating: 4.8
  },
  {
    id: 'exp-4',
    name: 'Pico do Itapeva & Lavandário',
    category: 'mirante',
    lat: -22.7500,
    lng: -45.5300,
    description: 'Ponto mais alto acessível da serra a 2.030 metros de altitude.',
    recommendedMinutes: 40,
    rating: 4.9
  },
  {
    id: 'exp-5',
    name: 'Posto Shell RodoRede Dutra',
    category: 'posto',
    lat: -23.1800,
    lng: -45.8800,
    description: 'Posto amplo 24h com calibragem de pneus e troca de óleo rápida.',
    recommendedMinutes: 15,
    rating: 4.5
  }
];

// Sample scenic route preview across SP - Campos do Jordão
const SCENIC_PREVIEW_PATH: [number, number][] = [
  [-23.5505, -46.6333],
  [-23.4800, -46.4500],
  [-23.3500, -46.1500],
  [-23.2237, -45.9009],
  [-23.0500, -45.7000],
  [-22.9511, -45.4523],
  [-22.8200, -45.6500],
  [-22.7562, -45.5781],
  [-22.7394, -45.5914]
];

export const MapTab: React.FC<MapTabProps> = ({
  currentVehicle,
  activeTrip,
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

  // Default preview trip when no trip is active
  const defaultPreviewTrip: TripPlan = {
    id: 'trip-preview-sp-campos',
    title: 'Serra da Mantiqueira & Rota dos Mirantes',
    originName: 'São Paulo - SP (Centro)',
    originCoords: [-23.5505, -46.6333],
    destinationName: 'Campos do Jordão - SP',
    destinationCoords: [-22.7394, -45.5914],
    modality: 'panoramica',
    returnModality: 'rapida',
    isCircular: false,
    distanceKm: 172,
    durationMinutes: 165,
    vehicleId: currentVehicle?.id || 'default',
    routePath: SCENIC_PREVIEW_PATH,
    stops: MAP_EXPLORE_STOPS,
    weatherPoints: [],
    hasRainRisk: false,
    peopleCount: 1,
    vehicleGroupType: 'single_vehicle',
    groupVehiclesCount: 1,
    participants: [{ id: 'p-1', name: 'Você' }],
    splitExpenses: false,
    foodCostPerPerson: 50,
    fuelPricePerLiter: 5.89,
    estimatedFuelLiters: 11.5,
    estimatedFuelCost: 67.73,
    knownTollsCost: 18.0,
    totalFoodCost: 50,
    totalEstimatedCost: 135.73,
    costPerPerson: 135.73,
    status: 'planned',
    createdAt: new Date().toISOString()
  };

  const tripToDisplay = activeTrip || defaultPreviewTrip;

  // Filter stops based on active layers
  const activeStops = (tripToDisplay.stops.length > 0 ? tripToDisplay.stops : MAP_EXPLORE_STOPS).filter(s => {
    if (s.category === 'mirante') return showStops;
    if (s.category === 'posto') return showGasStations;
    if (s.category === 'restaurante') return showRestaurants;
    return true;
  });

  const displayRoutePath = tripToDisplay.routePath.length > 0 ? tripToDisplay.routePath : SCENIC_PREVIEW_PATH;

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      {/* 100% IMMERSIVE FULL-SCREEN MAP CANVAS */}
      <InteractiveMap
        originCoords={tripToDisplay.originCoords}
        destinationCoords={tripToDisplay.destinationCoords}
        originLabel={tripToDisplay.originName}
        destinationLabel={tripToDisplay.destinationName}
        routePath={displayRoutePath}
        routeModality={tripToDisplay.modality}
        stops={activeStops}
        showRainLayer={showRainRadar}
        className="w-full h-full"
      />

      {/* TOP-LEFT FLOATING CARD: VIAGEM COM OPÇÃO DE COMPARTILHAR, FAZER COMBOIO, INICIAR (MENU BRANCO LIMPO) */}
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
              onClick={() => onStartTrip?.(tripToDisplay)}
              className="py-1.5 px-2 rounded-xl bg-white hover:bg-emerald-50 active:scale-95 border border-emerald-400 text-emerald-800 text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer"
              title={activeTrip ? 'Continuar navegação' : 'Iniciar viagem no mapa'}
            >
              <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
              <span className="truncate">{activeTrip ? 'Navegar' : 'Iniciar'}</span>
            </button>
          </div>
        </div>
      </div>

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

      {/* BOTTOM FLOATING "TRAÇAR ROTA" CTA */}
      <div className="absolute bottom-5 right-4 z-30 pointer-events-auto">
        <button
          onClick={() => onOpenRoutePlanner(tripToDisplay.originName, tripToDisplay.destinationName, tripToDisplay.destinationCoords)}
          className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-50 active:scale-95 text-slate-900 border border-slate-200 font-extrabold text-xs flex items-center gap-2 shadow-xl transition-all cursor-pointer"
        >
          <Navigation className="w-4 h-4 text-emerald-600 fill-emerald-600" />
          <span>Alterar Rota</span>
        </button>
      </div>

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

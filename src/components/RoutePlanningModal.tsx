import React, { useState } from 'react';
import { 
  TripPlan, 
  Vehicle, 
  RouteModality 
} from '../types';
import { generateRouteAlternatives, RouteOptionCalculated } from '../services/routeCalculator';
import { InteractiveMap } from './InteractiveMap';
import { 
  X, 
  Users, 
  Fuel, 
  Clock, 
  Share2, 
  Play, 
  Bookmark, 
  AlertTriangle, 
  CloudRain, 
  Sun, 
  Compass, 
  DollarSign, 
  Check, 
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface RoutePlanningModalProps {
  origin: string;
  destination: string;
  destinationCoords?: [number, number];
  vehicle: Vehicle;
  isOpen: boolean;
  onClose: () => void;
  onStartTrip: (trip: TripPlan) => void;
  onSaveTrip: (trip: TripPlan) => void;
  onOpenShareModal: (trip: TripPlan) => void;
}

export const RoutePlanningModal: React.FC<RoutePlanningModalProps> = ({
  origin,
  destination,
  destinationCoords = [-22.7394, -45.5914],
  vehicle,
  isOpen,
  onClose,
  onStartTrip,
  onSaveTrip,
  onOpenShareModal
}) => {
  const [selectedModality, setSelectedModality] = useState<RouteModality>('equilibrada');
  const [peopleCount, setPeopleCount] = useState(1);
  const [vehicleGroupType, setVehicleGroupType] = useState<'single_vehicle' | 'multi_vehicle'>('single_vehicle');
  const [groupVehiclesCount, setGroupVehiclesCount] = useState(1);
  const [splitExpenses, setSplitExpenses] = useState(true);
  const [foodCostPerPerson, setFoodCostPerPerson] = useState(50);
  const [fuelPrice, setFuelPrice] = useState(5.89);
  const [returnModality, setReturnModality] = useState<'rapida' | 'turistica' | 'economica' | 'auto'>('rapida');
  const [showRainLayer, setShowRainLayer] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [showReturnOptions, setShowReturnOptions] = useState(false);

  if (!isOpen) return null;

  const originCoords: [number, number] = [-23.5505, -46.6333];

  const alternatives = generateRouteAlternatives({
    originName: origin,
    originCoords,
    destinationName: destination,
    destinationCoords,
    vehicle,
    peopleCount,
    vehicleGroupType,
    groupVehiclesCount,
    splitExpenses,
    foodCostPerPerson,
    fuelPricePerLiter: fuelPrice,
    returnModality
  });

  const activeOption = alternatives.find(a => a.modality === selectedModality) || alternatives[0];

  const handleBuildTripPlan = (): TripPlan => {
    return {
      id: `trip-${Date.now()}`,
      title: `${activeOption.title}: ${origin.split('-')[0].trim()} até ${destination.split('-')[0].trim()}`,
      originName: origin,
      originCoords,
      destinationName: destination,
      destinationCoords,
      modality: activeOption.modality,
      returnModality,
      isCircular: false,
      distanceKm: activeOption.distanceKm,
      durationMinutes: activeOption.durationMinutes,
      vehicleId: vehicle.id,
      routePath: activeOption.routePath,
      stops: activeOption.stops,
      weatherPoints: activeOption.weatherPoints,
      hasRainRisk: activeOption.hasRainRisk,
      peopleCount,
      vehicleGroupType,
      groupVehiclesCount,
      participants: Array.from({ length: peopleCount }).map((_, i) => ({
        id: `p-${i + 1}`,
        name: i === 0 ? 'Você' : `Participante ${i + 1}`
      })),
      splitExpenses,
      foodCostPerPerson,
      fuelPricePerLiter: fuelPrice,
      estimatedFuelLiters: activeOption.fuelLiters,
      estimatedFuelCost: activeOption.fuelCost,
      knownTollsCost: activeOption.tollsCost,
      totalFoodCost: activeOption.totalFoodCost,
      totalEstimatedCost: activeOption.totalCost,
      costPerPerson: activeOption.costPerPerson,
      capacityWarning: activeOption.capacityWarning,
      status: 'planned',
      createdAt: new Date().toISOString()
    };
  };

  const handleStart = () => {
    const trip = handleBuildTripPlan();
    onStartTrip(trip);
  };

  const handleSave = () => {
    const trip = handleBuildTripPlan();
    onSaveTrip(trip);
  };

  const handleShare = () => {
    const trip = handleBuildTripPlan();
    onOpenShareModal(trip);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
        {/* TOP BAR */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-600" />
              <span>Comparação de Roteiros</span>
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {origin.split('-')[0].trim()} ➡️ {destination.split('-')[0].trim()} · Veículo: <strong className="text-slate-800 dark:text-slate-200">{vehicle.nickname || vehicle.model}</strong>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* CAPACITY WARNING IF APPLICABLE */}
          {activeOption.capacityWarning && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Aviso de Capacidade de Passageiros:</span>
                <p className="mt-0.5">{activeOption.capacityWarning}</p>
              </div>
            </div>
          )}

          {/* 6 MODALITY COMPARISON TABS (Requirement #6 & #20) */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Selecione o Tipo de Rota:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {alternatives.map((alt) => {
                const isSelected = alt.modality === selectedModality;
                return (
                  <button
                    key={alt.modality}
                    onClick={() => setSelectedModality(alt.modality)}
                    className={`p-3 rounded-2xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                      {alt.badge}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {alt.title}
                    </h4>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                      {alt.distanceKm} km · {Math.round(alt.durationMinutes / 60)}h{alt.durationMinutes % 60}m
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SPLIT VIEW: MAP PREVIEW & DETAILED STATS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* MAP COLUMN */}
            <div className="lg:col-span-7 h-64 sm:h-80 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 relative">
              <InteractiveMap 
                originCoords={originCoords}
                destinationCoords={destinationCoords}
                originLabel={origin}
                destinationLabel={destination}
                routePath={activeOption.routePath}
                routeModality={activeOption.modality}
                stops={activeOption.stops}
                showRainLayer={showRainLayer}
                className="w-full h-full"
              />

              {/* Rain layer button */}
              <button
                onClick={() => setShowRainLayer(!showRainLayer)}
                className={`absolute top-3 right-3 z-30 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md backdrop-blur-md transition-colors ${
                  showRainLayer 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white/90 text-slate-700 hover:bg-white'
                }`}
              >
                <CloudRain className="w-4 h-4" />
                <span>Camada Chuva</span>
              </button>
            </div>

            {/* DETAILS COLUMN */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {activeOption.title}
                  </span>
                  <span className="text-xs text-amber-500 font-bold">
                    {'★'.repeat(activeOption.scenicQualityStars)} Cênica
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeOption.description}
                </p>

                {/* Financial breakdown */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Combustível ({activeOption.fuelLiters} L)</span>
                    <strong className="text-slate-900 dark:text-white">R$ {activeOption.fuelCost.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Pedágios Estimados</span>
                    <strong className="text-slate-900 dark:text-white">R$ {activeOption.tollsCost.toFixed(2)}</strong>
                  </div>
                  {peopleCount > 1 && (
                    <div className="col-span-2 pt-1">
                      <span className="text-slate-500 block">Custo Médio por Pessoa ({peopleCount} viajantes)</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 text-sm font-extrabold">
                        R$ {activeOption.costPerPerson.toFixed(2)}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* WEATHER ALONG ROUTE */}
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span className="flex items-center gap-1.5">
                    {activeOption.hasRainRisk ? <CloudRain className="w-4 h-4 text-blue-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
                    Clima ao Longo do Percurso
                  </span>
                  <span className="text-[11px] text-slate-500 font-normal">Previsão por horário</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {activeOption.weatherPoints.map((wp, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                      <span>{wp.passTime} · {wp.locationName}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-200">
                        {wp.tempC}°C · {wp.condition} ({wp.rainProb}% chuva)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ATRAÇÕES TURÍSTICAS INCLUÍDAS (Requirement #6) */}
              {activeOption.stops && activeOption.stops.length > 0 && (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Atrações & Paradas Sugeridas ({activeOption.stops.length})
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Roteiro selecionado</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeOption.stops.map((stop, i) => (
                      <div key={stop.id || i} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {i + 1}. {stop.name}
                          </span>
                          {stop.estimatedArrivalHour && (
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md">
                              {stop.estimatedArrivalHour}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {stop.description}
                        </p>
                        <div className="text-[10px] text-slate-400">
                          Visita recomendada: {stop.recommendedMinutes} min
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* GROUP & PEOPLE CONFIGURATION (Requirement: QUANTIDADE DE PESSOAS NA VIAGEM) */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-850/50 space-y-3">
            <button
              onClick={() => setShowGroupDetails(!showGroupDetails)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Quantas pessoas vão viajar? ({peopleCount} {peopleCount === 1 ? 'pessoa' : 'pessoas'})
                </span>
              </div>
              {showGroupDetails ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showGroupDetails && (
              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700 animate-in fade-in">
                {/* Counter */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-400">Número de viajantes:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPeopleCount(Math.max(1, peopleCount - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-slate-900 dark:text-white">
                      {peopleCount}
                    </span>
                    <button
                      onClick={() => setPeopleCount(peopleCount + 1)}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-sm flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Single Vehicle vs Multi Vehicle */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => setVehicleGroupType('single_vehicle')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      vehicleGroupType === 'single_vehicle'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    No mesmo veículo
                  </button>
                  <button
                    onClick={() => setVehicleGroupType('multi_vehicle')}
                    className={`p-2.5 rounded-xl border text-left transition-colors ${
                      vehicleGroupType === 'multi_vehicle'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Vários veículos (Comboio)
                  </button>
                </div>

                {vehicleGroupType === 'multi_vehicle' && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Quantidade de veículos no grupo:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGroupVehiclesCount(Math.max(1, groupVehiclesCount - 1))}
                        className="w-6 h-6 rounded bg-slate-200 text-slate-800 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-bold">{groupVehiclesCount}</span>
                      <button
                        onClick={() => setGroupVehiclesCount(groupVehiclesCount + 1)}
                        className="w-6 h-6 rounded bg-slate-200 text-slate-800 text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Expense Split Toggle */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Dividir combustível e despesas igualmente</span>
                  <input
                    type="checkbox"
                    checked={splitExpenses}
                    onChange={(e) => setSplitExpenses(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* RETURN OPTIONS (Requirement #10: "Como deseja voltar?") */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-850/50 space-y-3">
            <button
              onClick={() => setShowReturnOptions(!showReturnOptions)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Como deseja voltar? ({returnModality === 'rapida' ? 'Volta Rápida' : returnModality === 'turistica' ? 'Volta Turística' : 'Decidir depois'})
                </span>
              </div>
              {showReturnOptions ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showReturnOptions && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-xs animate-in fade-in">
                {[
                  { id: 'rapida', label: 'Volta Rápida' },
                  { id: 'turistica', label: 'Volta Turística' },
                  { id: 'economica', label: 'Volta Econômica' },
                  { id: 'auto', label: 'App Decide' }
                ].map((ret) => (
                  <button
                    key={ret.id}
                    onClick={() => setReturnModality(ret.id as any)}
                    className={`p-2 rounded-xl border text-center transition-colors ${
                      returnModality === ret.id
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {ret.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-4 h-4 text-slate-500" />
              <span>Salvar</span>
            </button>

            <button
              onClick={handleShare}
              className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-emerald-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>Compartilhar</span>
            </button>
          </div>

          <button
            onClick={handleStart}
            className="flex-1 py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer min-h-[44px]"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Iniciar Viagem</span>
          </button>
        </div>
      </div>
    </div>
  );
};

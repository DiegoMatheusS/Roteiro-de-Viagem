import React, { useEffect, useState } from 'react';
import { 
  TripPlan, 
  Vehicle, 
  RouteModality 
} from '../types';
import { getPlanningAlternatives, buildPlannedTrip, type RoutePlanningInput } from '../services/routeCalculator';
import { InteractiveMap } from './InteractiveMap';
import { FuelComparisonPanel } from './FuelComparisonPanel';
import type { AppliedFuelPrice } from '../types/fuel';
import { ManualStopsEditor } from './ManualStopsEditor';
import { calculateItinerary, applyItinerary } from '../services/itinerary';
import type { MandatoryStop, SuggestedStop } from '../types/itinerary';
import { createRoadDraft } from '../services/touristCircuit';
import { fuelApi } from '../services/fuelApi';
import { TollContribution } from './TollContribution';
import type { RouteToll } from '../types/tolls';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
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
  originCoords?: [number, number];
  presetTrip?: TripPlan;
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
  originCoords = [-23.5505, -46.6333],
  presetTrip,
  vehicle,
  isOpen,
  onClose,
  onStartTrip,
  onSaveTrip,
  onOpenShareModal
}) => {
  const [selectedModality, setSelectedModality] = useState<RouteModality>(presetTrip?.modality || 'equilibrada');
  const [peopleCount, setPeopleCount] = useState(presetTrip?.peopleCount || 1);
  const [vehicleGroupType, setVehicleGroupType] = useState<'single_vehicle' | 'multi_vehicle'>('single_vehicle');
  const [groupVehiclesCount, setGroupVehiclesCount] = useState(1);
  const [splitExpenses, setSplitExpenses] = useState(true);
  const [foodCostPerPerson, setFoodCostPerPerson] = useState(50);
  const [fuelPrice, setFuelPrice] = useState(0);
  const [appliedFuelPrice, setAppliedFuelPrice] = useState<AppliedFuelPrice | undefined>();
  const [returnModality, setReturnModality] = useState<'rapida' | 'turistica' | 'economica' | 'auto'>(presetTrip?.returnModality || 'rapida');
  const [showRainLayer, setShowRainLayer] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [showReturnOptions, setShowReturnOptions] = useState(false);
  const [routeAnchor] = useState(() => presetTrip?.routingSource === 'OSRM' || presetTrip?.manualStops !== undefined ? presetTrip : createRoadDraft({ originName: origin, originCoords, destinationName: destination, destinationCoords, vehicle, circular: false, limits: { mode: 'destination' } }));
  const [workingTrip, setWorkingTrip] = useState(routeAnchor);
  const [manualStops, setManualStops] = useState<MandatoryStop[]>(presetTrip?.manualStops || []);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<SuggestedStop[]>(presetTrip?.acceptedSuggestions || []);
  const [suggestions, setSuggestions] = useState<SuggestedStop[]>([]);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [useRoad, setUseRoad] = useState(true);
  const [isRouting, setIsRouting] = useState(false), [routeError, setRouteError] = useState('');
  const [exceedsLimit, setExceedsLimit] = useState(false), [limitAccepted, setLimitAccepted] = useState(false);
  const [calculatedKey, setCalculatedKey] = useState(''), [routingAttempt, setRoutingAttempt] = useState(0);
  const routingKey = JSON.stringify([manualStops, acceptedSuggestions, routeAnchor?.originCoords, routeAnchor?.destinationCoords, routingAttempt]);
  const staleRoute = useRoad && calculatedKey !== routingKey;
  useEffect(() => {
    if (!useRoad || !routeAnchor || !isOpen) return;
    const controller = new AbortController();
    setIsRouting(true); setRouteError(''); setLimitAccepted(false);
    const timer = setTimeout(() => {
      calculateItinerary(routeAnchor, manualStops, acceptedSuggestions, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setWorkingTrip(applyItinerary(routeAnchor, result)); setSuggestions(result.suggestions); setExceedsLimit(result.exceedsLimit); setCalculatedKey(routingKey);
      }).catch(error => { if (!controller.signal.aborted) setRouteError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setIsRouting(false); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [routingKey, useRoad, routeAnchor, isOpen]);
  const [departureAt, setDepartureAt] = useState('');
  const [weatherError, setWeatherError] = useState(''), [tollError, setTollError] = useState('');
  const [conditionsBusy, setConditionsBusy] = useState(false), [conditionsAttempt, setConditionsAttempt] = useState(0);
  const conditionsKey = JSON.stringify([workingTrip?.routePath, workingTrip?.durationMinutes, vehicle.type, departureAt, conditionsAttempt]);
  useEffect(() => {
    if (!isOpen || !workingTrip?.routePath.length || isRouting || staleRoute) return;
    const controller = new AbortController();
    setConditionsBusy(true); setWeatherError(''); setTollError('');
    setWorkingTrip(trip => trip ? { ...trip, weatherPoints: [], hasRainRisk: false, knownTollsCost: 0, tollsStatus: 'unknown', tolls: [] } : trip);
    const trip = workingTrip;
    const fetchConditions = async () => {
      const results = await Promise.allSettled([
        fuelApi<{ weatherPoints: TripPlan['weatherPoints']; hasRainRisk: boolean; source: string; updatedAt: string }>('/weather/route', { method: 'POST', body: JSON.stringify({ routePath: trip.routePath, drivingMinutes: trip.durationMinutes, departureAt: departureAt ? new Date(departureAt).toISOString() : undefined }), signal: controller.signal }),
        fuelApi<{ tolls: RouteToll[]; knownCost: number; status: 'unknown' | 'partial'; warning: string }>('/tolls/route', { method: 'POST', body: JSON.stringify({ routePath: trip.routePath, vehicleType: vehicle.type }), signal: controller.signal })
      ]);
      if (controller.signal.aborted) return;
      const [weather, tolls] = results;
      if (weather.status === 'rejected') setWeatherError(weather.reason.message);
      if (tolls.status === 'rejected') setTollError(tolls.reason.message);
      setWorkingTrip(current => current ? { ...current, departureAt: departureAt ? new Date(departureAt).toISOString() : undefined,
        ...(weather.status === 'fulfilled' ? { weatherPoints: weather.value.weatherPoints, hasRainRisk: weather.value.hasRainRisk, weatherSource: weather.value.source, weatherUpdatedAt: weather.value.updatedAt } : { weatherPoints: [], hasRainRisk: false, weatherSource: undefined }),
        ...(tolls.status === 'fulfilled' ? { tolls: tolls.value.tolls, knownTollsCost: tolls.value.knownCost, tollsStatus: tolls.value.status } : { tolls: [], knownTollsCost: 0, tollsStatus: 'unknown' }) } : current);
      setConditionsBusy(false);
    };
    void fetchConditions(); return () => controller.abort();
  }, [conditionsKey, isOpen, isRouting, staleRoute]);
  useModalScrollLock(isOpen);

  if (!isOpen) return null;

  const planningInput: RoutePlanningInput = {
    originName: origin,
    originCoords,
    destinationName: destination,
    destinationCoords,
    vehicle: appliedFuelPrice ? { ...vehicle, consumption: { ...vehicle.consumption, userConfigured: appliedFuelPrice.consumptionKmPerLiter } } : vehicle,
    peopleCount,
    vehicleGroupType,
    groupVehiclesCount,
    splitExpenses,
    foodCostPerPerson,
    fuelPricePerLiter: fuelPrice,
    returnModality
  };
  const alternatives = getPlanningAlternatives(planningInput, workingTrip);

  const activeOption = alternatives.find(a => a.modality === selectedModality) || alternatives[0];

  const handleBuildTripPlan = (): TripPlan => {
    return { ...buildPlannedTrip(planningInput, activeOption, workingTrip), fuelPriceSource: appliedFuelPrice };
  };

  const changeStops = (stops: MandatoryStop[]) => {
    setUseRoad(true); setManualStops(stops);
    setAcceptedSuggestions(current => current.map(stop => ({ ...stop, afterIndex: Math.min(stop.afterIndex, Math.max(-1, stops.length - 1)) })));
  };
  const blocked = conditionsBusy || isRouting || staleRoute || Boolean(routeError) || exceedsLimit && !limitAccepted;
  const handleStart = () => {
    if (blocked) return;
    const trip = handleBuildTripPlan();
    onStartTrip(trip);
  };

  const handleSave = () => {
    if (blocked) return;
    const trip = handleBuildTripPlan();
    onSaveTrip(trip);
  };

  const handleShare = () => {
    if (blocked) return;
    const trip = handleBuildTripPlan();
    onOpenShareModal(trip);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Planejamento da viagem" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[92vh] flex flex-col">
        {/* TOP BAR */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-600" />
              <span>{presetTrip ? 'Configurar Passeio' : 'Comparação de Roteiros'}</span>
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
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Percurso por estradas reais. Tempo sem trânsito ao vivo. O orçamento inclui apenas tarifas aprovadas identificadas; a cobertura de pedágios é parcial.
          </p>
          <section className="border rounded-2xl p-4 space-y-3"><h3 className="text-sm font-bold">Clima e pedágios</h3><label className="block text-xs">Saída planejada (vazio: agora)<input type="datetime-local" value={departureAt} onChange={e => setDepartureAt(e.target.value)} className="block mt-1 border rounded-xl p-2" /></label>{conditionsBusy && <p role="status" className="text-xs text-emerald-700">Consultando previsão e pedágios reais...</p>}{weatherError && <p role="alert" className="text-xs text-amber-800">Clima: {weatherError}</p>}{tollError && <p role="alert" className="text-xs text-amber-800">Pedágios: {tollError}</p>}{workingTrip?.weatherSource && <p className="text-xs text-slate-500">Previsão: {workingTrip.weatherSource} · atualizada {new Date(workingTrip.weatherUpdatedAt!).toLocaleString('pt-BR')} · Horários aproximados de passagem considerando a duração total planejada, sem trânsito ao vivo.</p>}<button disabled={conditionsBusy} onClick={() => setConditionsAttempt(v => v + 1)} className="text-xs underline text-emerald-700">Atualizar clima e tarifas</button>{workingTrip?.tolls?.map(toll => <TollContribution key={toll.id} toll={toll} vehicleType={vehicle.type} />)}{!workingTrip?.tolls?.length && !conditionsBusy && <p className="text-xs text-slate-500">Nenhum pedágio identificado nesta consulta. Isso não garante ausência de cobrança.</p>}</section>
          <section className="border rounded-2xl p-4 space-y-3"><h3 className="text-sm font-bold">Paradas obrigatórias</h3><ManualStopsEditor value={manualStops} onChange={changeStops} bias={originCoords} />
            {isRouting && <p role="status" className="text-xs text-emerald-700">Recalculando o percurso com todas as paradas...</p>}
            {routeError && <div role="alert" className="text-xs text-rose-700">{routeError}<button type="button" onClick={() => setRoutingAttempt(value => value + 1)} className="ml-3 underline">Recalcular rota</button></div>}
            {workingTrip?.routeWarnings?.map(warning => <p key={warning} className="text-xs bg-amber-50 text-amber-800 rounded-xl p-3">{warning}</p>)}
            {exceedsLimit && <label className="flex gap-2 text-xs text-amber-800"><input type="checkbox" checked={limitAccepted} onChange={e => setLimitAccepted(e.target.checked)} />Quero continuar com as paradas escolhidas, mesmo acima do limite.</label>}
          </section>
          {useRoad && (suggestions.length > 0 || acceptedSuggestions.length > 0) && <section className="border rounded-2xl p-4 space-y-3"><h3 className="text-sm font-bold">Paradas sugeridas</h3><p className="text-xs text-slate-500">Locais reais próximos ao percurso. Aceitar uma sugestão mantém a ordem das suas paradas obrigatórias e recalcula os custos.</p>
            {acceptedSuggestions.map(stop => <div key={stop.id} className="flex justify-between gap-3 text-xs bg-emerald-50 rounded-xl p-3"><span>✓ {stop.location.name} · {stop.stayMinutes} min</span><button type="button" onClick={() => setAcceptedSuggestions(value => value.filter(s => s.id !== stop.id))} className="text-rose-700">Remover sugestão</button></div>)}
            {suggestions.filter(stop => !discarded.includes(stop.id) && !acceptedSuggestions.some(s => s.id === stop.id)).map(stop => <div key={stop.id} className="flex flex-wrap justify-between gap-3 text-xs border rounded-xl p-3"><span>{stop.location.name} · {stop.stayMinutes} min</span><div className="flex gap-3"><button type="button" onClick={() => setAcceptedSuggestions(value => [...value, stop])} className="text-emerald-700 font-bold">Aceitar</button><button type="button" onClick={() => setDiscarded(value => [...value, stop.id])} className="text-slate-500">Descartar</button></div></div>)}
          </section>}
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
                      {alt.distanceKm} km · {Math.floor(alt.durationMinutes / 60)}h{alt.durationMinutes % 60}m
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
                    {useRoad ? 'Percurso rodoviário' : `${'★'.repeat(activeOption.scenicQualityStars)} Cênica`}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeOption.description}
                </p>

                {/* Financial breakdown */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Combustível ({activeOption.fuelLiters} L)</span>
                    <strong className="text-slate-900 dark:text-white">{fuelPrice > 0 ? `R$ ${activeOption.fuelCost.toFixed(2)}` : 'Preço não informado'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">{useRoad ? 'Pedágios' : 'Pedágios Estimados'}</span>
                    <strong className="text-slate-900 dark:text-white">{workingTrip?.tollsStatus === 'unknown' ? 'Não informadas' : `R$ ${activeOption.tollsCost.toFixed(2)} (parcial)`}</strong>
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

              <label className="block p-3 rounded-xl border border-slate-200 text-xs font-semibold">
                Preço de planejamento (R$/L)
                <input aria-label="Preço de planejamento" type="number" min="0.1" max="50" step="0.001" value={fuelPrice || ''} onChange={e => { setFuelPrice(Number(e.target.value)); setAppliedFuelPrice(undefined); }} placeholder="Informe ou escolha um posto" className="mt-1 w-full p-2 border rounded-lg" />
                <span className="block mt-2 font-normal text-slate-500">{appliedFuelPrice ? `${appliedFuelPrice.stationName} · visto em ${new Date(appliedFuelPrice.observedAt).toLocaleString('pt-BR')}` : fuelPrice > 0 ? 'Estimativa com preço informado manualmente.' : 'Os totais ainda não incluem combustível.'}</span>
              </label>

              {/* WEATHER ALONG ROUTE */}
              {activeOption.weatherPoints.length > 0 && <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2">
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
                      <span>{new Date(wp.forecastAt || wp.passTime).toLocaleString('pt-BR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {wp.locationName}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-200">
                        {wp.tempC}°C · {wp.condition} ({wp.rainProb}% chuva)
                      </span>
                    </div>
                  ))}
                </div>
              </div>}

              {/* ATRAÇÕES TURÍSTICAS INCLUÍDAS (Requirement #6) */}
              {activeOption.stops && activeOption.stops.length > 0 && (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      {useRoad ? 'Sequência das paradas' : 'Atrações & Paradas Sugeridas'} ({activeOption.stops.length})
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Roteiro selecionado</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeOption.stops.map((stop, i) => (
                      <div key={stop.id || i} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {i + 1}. {stop.name}{stop.type && <span className="block text-[10px] text-emerald-700">{stop.type === 'mandatory' ? 'Obrigatória · definida por você' : 'Sugestão aceita'}</span>}
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
                          {stop.type === 'mandatory' ? 'Permanência definida' : 'Visita recomendada'}: {stop.recommendedMinutes} min
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <FuelComparisonPanel vehicle={vehicle} routePath={activeOption.routePath} routeWaypoints={workingTrip?.waypointOrder} onApply={price => { setFuelPrice(price.price); setAppliedFuelPrice(price); }} />

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
              disabled={blocked}
              title={blocked ? 'Aguarde o cálculo e confira os limites do roteiro' : undefined}
              onClick={handleSave}
              className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-4 h-4 text-slate-500" />
              <span>Salvar</span>
            </button>

            <button
              disabled={blocked}
              title={blocked ? 'Aguarde o cálculo e confira os limites do roteiro' : undefined}
              onClick={handleShare}
              className="py-2.5 px-3 rounded-xl border border-slate-200 hover:border-emerald-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>Compartilhar</span>
            </button>
          </div>

          <button
            disabled={blocked}
              title={blocked ? 'Aguarde o cálculo e confira os limites do roteiro' : undefined}
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


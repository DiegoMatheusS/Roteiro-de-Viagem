import React, { useState } from 'react';
import { Vehicle, TripPlan } from '../types';
import { PRESET_DESTINATIONS } from '../data/sampleRoutes';
import { createRoadDraft, generateVerifiedTouristCircuit } from '../services/touristCircuit';
import { LocationSearch } from './LocationSearch';
import { ManualStopsEditor } from './ManualStopsEditor';
import type { MandatoryStop, PlanningLimits } from '../types/itinerary';
import { getCurrentDeviceLocation } from '../services/locationService';
import { 
  Navigation, 
  MapPin, 
  Crosshair, 
  ChevronRight, 
  Users, 
  Sparkles, 
  ArrowUpDown, 
  Clock, 
  Gauge, 
  Mountain, 
  Utensils, 
  Landmark, 
  Trees, 
  Map as MapIcon, 
  Compass, 
  ArrowRight,
  Check,
  ChevronDown,
  RotateCcw,
  Calendar,
  X,
  Fuel
} from 'lucide-react';

interface HomeTabProps {
  currentVehicle: Vehicle | null;
  vehicles: Vehicle[];
  onSelectVehicle: (id: string) => void;
  onOpenRoutePlanner: (origin: string, destination: string, destinationCoords?: [number, number], originCoords?: [number, number]) => void;
  onLaunchTouristCircuit: (trip: TripPlan) => void;
  onOpenConvoyList: () => void;
  onNavigateToMapTab: () => void;
  activeConvoyId?: string | null;
  onEndConvoy?: () => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  currentVehicle,
  vehicles,
  onSelectVehicle,
  onOpenRoutePlanner,
  onLaunchTouristCircuit,
  onOpenConvoyList,
  onNavigateToMapTab,
  activeConvoyId,
  onEndConvoy
}) => {
  // Mode selection: 'km', 'horas', or 'destino'
  const [plannerMode, setPlannerMode] = useState<'km' | 'horas' | 'destino'>('km');

  // Tipo de percurso: Ida e volta (Padrão!) vs Só ida (Requirement: POR KM: IDA E VOLTA OU SÓ IDA)
  const [tripType, setTripType] = useState<'round_trip' | 'one_way'>('round_trip');

  // Custom KM state (user can type any value or pick a shortcut)
  const [customKm, setCustomKm] = useState<number>(100);

  // Custom Hours state (user can type any value or pick a shortcut)
  const [customHours, setCustomHours] = useState<number>(2.5);

  // Departure Time scheduling: Agora vs Horário Programado (Requirement #2)
  const [departureMode, setDepartureMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledTime, setScheduledTime] = useState<string>('08:30');

  // Multi-selection of tourist attractions: starts UNCHECKED by default
  const [touristInterests, setTouristInterests] = useState<string[]>([]);

  // Quick Vehicle Switcher Modal state (Requirement #4)
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);

  // Traditional Origin & Destination state
  const [origin, setOrigin] = useState('São Paulo - SP (Centro)');
  const [originCoords, setOriginCoords] = useState<[number, number] | undefined>([-23.5505, -46.6333]);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | undefined>();
  const [manualStops, setManualStops] = useState<MandatoryStop[]>([]);
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Toggle interest in multi-select list (allows unchecking all)
  const toggleInterest = (id: string) => {
    if (touristInterests.includes(id)) {
      setTouristInterests(touristInterests.filter(i => i !== id));
    } else {
      setTouristInterests([...touristInterests, id]);
    }
  };

  const clearAllInterests = () => {
    setTouristInterests([]);
  };

  // Compute effective departure time string
  const getEffectiveDepartureTime = (): string => {
    if (departureMode === 'scheduled') {
      return scheduledTime;
    }
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Use current GPS location
  const handleUseCurrentLocation = async () => {
    setIsGettingGps(true);
    setLocationError(null);
    try {
      const position = await getCurrentDeviceLocation();
      setOriginCoords(position.coords);
      setOrigin(`Sua Localização (${position.coords[0].toFixed(3)}, ${position.coords[1].toFixed(3)})`);
    } catch (error) {
      setLocationError((error as Error).message);
    } finally {
      setIsGettingGps(false);
    }
  };

  const handleSwap = () => {
    const tempOrigin = origin;
    const tempCoords = originCoords;
    setOrigin(destination);
    setOriginCoords(destinationCoords);
    setDestination(tempOrigin);
    setDestinationCoords(tempCoords);
    setManualStops(value => [...value].reverse());
  };

  const handleSelectPreset = (preset: typeof PRESET_DESTINATIONS[0]) => {
    setDestination(`${preset.name} - ${preset.state}`);
    setDestinationCoords(preset.coords);
  };

  const launchWithStops = (trip: TripPlan, limits: PlanningLimits) => {
    if (destination.trim() && !destinationCoords) { setLocationError('Pesquise e selecione o destino digitado.'); return; }
    if (manualStops.some(stop => !stop.location.id || !stop.location.coords)) { setLocationError('Pesquise e escolha um local real para cada parada.'); return; }
    if (manualStops.length || destinationCoords || limits.mode === 'destination') {
      const end = destinationCoords || (trip.isCircular ? originCoords : manualStops.at(-1)?.location.coords);
      if (!end) { setLocationError('Escolha um destino ou uma parada final.'); return; }
      trip = { ...trip, destinationCoords: end, destinationName: destinationCoords ? destination : trip.isCircular ? origin : manualStops.at(-1)!.location.name, manualStops, planningLimits: limits };
    } else trip = { ...trip, planningLimits: limits };
    setLocationError(null); onLaunchTouristCircuit(trip);
  };

  const handleTouristGeneration = async (mode: 'km' | 'hours', target: number) => {
    if (!currentVehicle || isGenerating) return;
    if (!originCoords) { setLocationError('Selecione a origem ou use sua localização.'); return; }
    if (destination.trim() && !destinationCoords) { setLocationError('Escolha um destino válido na busca.'); return; }
    if (manualStops.some(stop => !stop.location.id || !stop.location.coords)) {
      setLocationError('Pesquise e selecione um local real para cada parada.'); return;
    }
    const limits: PlanningLimits = { mode, target };
    setIsGenerating(true); setLocationError(null);
    try {
      if (destinationCoords || manualStops.length) {
        // User-chosen points are mandatory; the server calculates them via OSRM.
        const end = destinationCoords || (tripType === 'round_trip' ? originCoords : manualStops.at(-1)?.location.coords);
        if (!end) throw new Error('Selecione um destino para o passeio só de ida.');
        const draft = createRoadDraft({
          originName: origin, originCoords, destinationName: destinationCoords ? destination : tripType === 'round_trip' ? origin : manualStops.at(-1)!.location.name,
          destinationCoords: end, vehicle: currentVehicle, circular: tripType === 'round_trip', limits
        });
        launchWithStops(draft, limits);
      } else {
        const verified = await generateVerifiedTouristCircuit({
          mode, target, tripType, originName: origin, originCoords,
          interests: touristInterests, vehicle: currentVehicle
        });
        launchWithStops(verified, limits);
      }
    } catch (error) {
      setLocationError((error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateByKm = (event: React.FormEvent) => {
    event.preventDefault();
    void handleTouristGeneration('km', customKm);
  };

  const handleGenerateByHours = (event: React.FormEvent) => {
    event.preventDefault();
    void handleTouristGeneration('hours', customHours);
  };

  const handleDestinationSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentVehicle || !originCoords || !destinationCoords) {
      setLocationError('Pesquise e selecione uma origem e um destino reais.'); return;
    }
    if (manualStops.some(stop => !stop.location.id || !stop.location.coords)) {
      setLocationError('Selecione um local válido para cada parada.'); return;
    }
    const draft = createRoadDraft({
      originName: origin, originCoords, destinationName: destination, destinationCoords,
      vehicle: currentVehicle, circular: false, limits: { mode: 'destination' }
    });
    launchWithStops(draft, { mode: 'destination' });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24 bg-slate-50 overflow-y-auto">
      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200 px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5 leading-none">
                Roteiro de Viagem
              </h1>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                O melhor da viagem também está no caminho.
              </p>
            </div>
          </div>

          {/* ACTIVE VEHICLE BADGE (CLICKABLE FOR QUICK SWITCH - Requirement #4) */}
          {currentVehicle && (
            <button
              onClick={() => setShowVehicleSwitcher(true)}
              className="p-1.5 pl-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-emerald-300 transition-all text-right flex items-center gap-2 cursor-pointer shadow-2xs group"
              title="Toque para trocar de veículo rapidamente"
            >
              <div>
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">
                    {currentVehicle.type === 'motorcycle' ? '🏍️ Moto' : '🚗 Carro'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
                </div>
                <span className="text-xs font-extrabold text-emerald-800 truncate max-w-[120px] block leading-tight">
                  {currentVehicle.nickname || currentVehicle.model}
                </span>
                <span className="text-[10px] text-slate-500 font-medium block">
                  {currentVehicle.consumption.userConfigured} km/l
                </span>
              </div>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        <div className="flex items-center justify-between gap-3 text-xs bg-white border border-slate-200 rounded-xl p-3">
          <span className="truncate text-slate-600">Origem: {origin || 'Não definida'}</span>
          <button type="button" onClick={handleUseCurrentLocation} disabled={isGettingGps} className="shrink-0 text-emerald-700 font-bold disabled:opacity-50">
            {isGettingGps ? 'Buscando GPS...' : 'Usar minha localização'}
          </button>
        </div>
        {locationError && <p role="alert" className="text-xs text-rose-700">{locationError}</p>}
        {!currentVehicle && <div role="status" className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950">Cadastre sua moto ou carro em <strong>Ajustes → Minha Garagem</strong> para calcular combustível e gerar viagens. Nenhum veículo é adicionado automaticamente.</div>}
        {isGenerating && <p role="status" className="text-xs text-emerald-700 font-semibold">Buscando atrações reais e verificando estradas. Aguarde...</p>}
        {/* ACTIVE CONVOY QUICK BANNER */}
        {activeConvoyId && (
          <div className="w-full p-3 rounded-2xl bg-violet-600 text-white text-xs font-bold flex items-center justify-between shadow-md transition-all gap-2">
            <div 
              onClick={onOpenConvoyList}
              className="flex items-center gap-2 flex-1 cursor-pointer min-w-0 hover:opacity-90"
            >
              <Users className="w-4 h-4 animate-pulse shrink-0" />
              <span className="truncate">Você tem um Comboio de Viagem ativo no mapa</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenConvoyList}
                className="py-1 px-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[11px] font-extrabold cursor-pointer transition-colors"
              >
                Abrir
              </button>
            </div>
          </div>
        )}

        <section aria-label="Origem, paradas e destino" className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <LocationSearch label="Origem" value={{ name: origin, coords: originCoords }} bias={originCoords} onChange={value => { setOrigin(value.name); setOriginCoords(value.coords); }} />
          <ManualStopsEditor value={manualStops} onChange={setManualStops} bias={originCoords} hideAddButton />
          <LocationSearch label="Destino" value={{ name: destination, coords: destinationCoords }} bias={originCoords} placeholder={plannerMode === 'destino' ? 'Escolha o destino' : 'Opcional no passeio por km ou horas'} onChange={value => { setDestination(value.name); setDestinationCoords(value.coords); }} />
          <div className="flex justify-between gap-3"><button type="button" disabled={manualStops.length >= 12} onClick={() => setManualStops(value => [...value, { id: crypto.randomUUID(), location: { name: '' }, stayMinutes: 0 }])} className="text-sm font-bold text-emerald-700">+ Adicionar parada</button><button type="button" onClick={handleSwap} title="Inverter origem e destino" className="text-xs text-slate-500"><ArrowUpDown className="w-4 h-4" /></button></div>
        </section>

        {/* MODE SELECTOR (POR KM, POR HORAS, COM DESTINO FIXO) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Como você deseja planejar?
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setPlannerMode('km')}
                className={`py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  plannerMode === 'km'
                    ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-600/10'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                <span>Por Km</span>
              </button>

              <button
                type="button"
                onClick={() => setPlannerMode('horas')}
                className={`py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  plannerMode === 'horas'
                    ? 'bg-white text-blue-800 shadow-xs ring-1 ring-blue-600/10'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Por Horas</span>
              </button>

              <button
                type="button"
                onClick={() => setPlannerMode('destino')}
                className={`py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  plannerMode === 'destino'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Com Destino</span>
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* MODO 1: POR KM (SEM PONTO DE PARTIDA OU DESTINO!) */}
          {/* ======================================================== */}
          {plannerMode === 'km' && (
            <form onSubmit={handleGenerateByKm} aria-busy={isGenerating} className="space-y-4 animate-in fade-in">
              {/* TIPO DE PERCURSO: IDA E VOLTA (PADRÃO) OU SÓ IDA */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                  Tipo de Percurso:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTripType('round_trip')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      tripType === 'round_trip'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800">
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ida e volta</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal leading-tight">
                      Passeio circular completo (ida + volta)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTripType('one_way')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      tripType === 'one_way'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                      <span>Só ida</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal leading-tight">
                      Até um destino turístico a essa distância
                    </span>
                  </button>
                </div>
              </div>

              {/* Explicação clara da distância (Requirement #1) */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                {tripType === 'round_trip' ? (
                  <p>
                    📌 <strong>Quilometragem Total:</strong> O valor informado representa o <strong>percurso completo, incluindo o retorno</strong> à sua origem por estradas cênicas sem repetir trajeto.
                  </p>
                ) : (
                  <p>
                    📌 <strong>Apenas Ida:</strong> O valor representa o trajeto de avanço até uma atração ou cidade turística recomendada para essa distância.
                  </p>
                )}
              </div>

              {/* Input livre para digitar a quilometragem */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Quantos quilômetros deseja percorrer {tripType === 'round_trip' ? '(total ida e volta)' : '(só ida)'}?
                </label>
                <div className="relative flex items-center">
                  <Gauge className="w-5 h-5 text-emerald-600 absolute left-3.5 pointer-events-none" />
                  <input
                    type="number"
                    min="15"
                    max="1000"
                    step="5"
                    value={customKm}
                    onChange={(e) => setCustomKm(Math.max(10, parseInt(e.target.value) || 0))}
                    placeholder="Digite a distância (ex: 80, 120, 200)"
                    className="w-full pl-11 pr-14 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-extrabold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    required
                  />
                  <span className="absolute right-4 text-xs font-bold text-slate-400 pointer-events-none">
                    KM
                  </span>
                </div>
              </div>

              {/* Botões rápidos de atalho por Km */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Ou escolha um atalho rápido:
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[20, 50, 100, 150, 250, 500].map((km) => (
                    <button
                      key={km}
                      type="button"
                      onClick={() => setCustomKm(km)}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        customKm === km
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-seleção de atrações turísticas: Deixa desmarcado por padrão */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Estilo das atrações (selecione uma ou mais):
                  </span>
                  {touristInterests.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-700 font-bold">
                        {touristInterests.length} selecionada(s)
                      </span>
                      <button
                        type="button"
                        onClick={clearAllInterests}
                        className="text-[10px] text-slate-400 hover:text-rose-600 font-medium underline cursor-pointer"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Padrão completo (normal)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'gastronomico', label: 'Gastronomia & Cafés', icon: Utensils },
                    { id: 'museus', label: 'Museus & Cultura', icon: Landmark },
                    { id: 'natureza', label: 'Parques & Cachoeiras', icon: Trees },
                    { id: 'historico', label: 'Cidades Históricas', icon: Landmark },
                    { id: 'panoramico', label: 'Mirantes & Serras', icon: Mountain }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSel = touristInterests.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleInterest(item.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSel
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-600/20 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          isSel ? 'bg-emerald-600 text-white' : 'border border-slate-300'
                        }`}>
                          {isSel && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <Icon className={`w-4 h-4 shrink-0 ${isSel ? 'text-emerald-700' : 'text-slate-400'}`} />
                        <span className="truncate text-[11px]">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Mensagem explicativa quando todos estão desmarcados */}
                {touristInterests.length === 0 ? (
                  <div className="p-3 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 leading-snug">
                      <span className="font-extrabold text-emerald-900 block text-[11px]">
                        Roteiro equilibrado automático
                      </span>
                      <p className="text-[11px] text-emerald-800">
                        Como nenhum estilo está marcado, o aplicativo gera automaticamente os <strong>pontos normais</strong> (gastronomia típica, museus, parques e cidades históricas) próximos da sua localização e compatíveis com os <strong>{customKm} km</strong> selecionados.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Foco do roteiro direcionado aos estilos marcados acima.</span>
                  </div>
                )}
              </div>

              {/* Botão de Gerar Roteiro por Km */}
              <button
                type="submit"
                disabled={!currentVehicle || isGenerating}
                className="w-full py-3.5 px-4 rounded-2xl disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer min-h-[44px]"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  Gerar Roteiro Turístico de {customKm} km ({tripType === 'round_trip' ? 'Ida e Volta' : 'Só Ida'})
                </span>
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* MODO 2: POR HORAS (COM AGORA VS HORÁRIO PROGRAMADO) */}
          {/* ======================================================== */}
          {plannerMode === 'horas' && (
            <form onSubmit={handleGenerateByHours} aria-busy={isGenerating} className="space-y-4 animate-in fade-in">
              {/* TIPO DE PERCURSO: IDA E VOLTA OU SÓ IDA */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1.5">
                  Tipo de Percurso:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTripType('round_trip')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      tripType === 'round_trip'
                        ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-1 ring-blue-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-800">
                      <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                      <span>Passear e voltar</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal leading-tight">
                      Retorna ao ponto de partida no tempo estipulado
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTripType('one_way')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      tripType === 'one_way'
                        ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-1 ring-blue-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Só ida</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1 font-normal leading-tight">
                      Viagem até destino compatível com esse tempo
                    </span>
                  </button>
                </div>
              </div>

              {/* HORÁRIO DE PARTIDA: AGORA VS PROGRAMADO (Requirement #2) */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Quando a viagem começa?
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Sincroniza previsão de chuva por trecho
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepartureMode('now')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      departureMode === 'now'
                        ? 'border-blue-600 bg-white text-blue-900 shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600'
                    }`}
                  >
                    Sair Agora
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepartureMode('scheduled')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      departureMode === 'scheduled'
                        ? 'border-blue-600 bg-white text-blue-900 shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600'
                    }`}
                  >
                    Horário Programado
                  </button>
                </div>

                {departureMode === 'scheduled' && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs text-slate-600">Horário previsto de saída:</span>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Input livre para digitar as horas */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Quantas horas você tem livres (condução + paradas)?
                </label>
                <div className="relative flex items-center">
                  <Clock className="w-5 h-5 text-blue-600 absolute left-3.5 pointer-events-none" />
                  <input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={customHours}
                    onChange={(e) => setCustomHours(Math.max(0.5, parseFloat(e.target.value) || 0))}
                    placeholder="Digite o tempo em horas (ex: 1.5, 2, 3)"
                    className="w-full pl-11 pr-16 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-extrabold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    required
                  />
                  <span className="absolute right-4 text-xs font-bold text-slate-400 pointer-events-none">
                    HORAS
                  </span>
                </div>
              </div>

              {/* Botões rápidos de atalho por Tempo */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Ou escolha uma duração rápida:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { hours: 1, label: '1 hora' },
                    { hours: 2, label: '2 horas' },
                    { hours: 3, label: '3 horas' },
                    { hours: 5, label: '5 horas' },
                    { hours: 8, label: 'Dia inteiro' }
                  ].map((item) => (
                    <button
                      key={item.hours}
                      type="button"
                      onClick={() => setCustomHours(item.hours)}
                      className={`py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        customHours === item.hours
                          ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-seleção de atrações turísticas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Estilo das atrações (selecione uma ou mais):
                  </span>
                  {touristInterests.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-blue-700 font-bold">
                        {touristInterests.length} selecionada(s)
                      </span>
                      <button
                        type="button"
                        onClick={clearAllInterests}
                        className="text-[10px] text-slate-400 hover:text-rose-600 font-medium underline cursor-pointer"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-blue-700 font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      Padrão completo (normal)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'gastronomico', label: 'Gastronomia & Cafés', icon: Utensils },
                    { id: 'museus', label: 'Museus & Cultura', icon: Landmark },
                    { id: 'natureza', label: 'Parques & Cachoeiras', icon: Trees },
                    { id: 'historico', label: 'Cidades Históricas', icon: Landmark },
                    { id: 'panoramico', label: 'Mirantes & Serras', icon: Mountain }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSel = touristInterests.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleInterest(item.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSel
                            ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-1 ring-blue-600/20 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          isSel ? 'bg-blue-600 text-white' : 'border border-slate-300'
                        }`}>
                          {isSel && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <Icon className={`w-4 h-4 shrink-0 ${isSel ? 'text-blue-700' : 'text-slate-400'}`} />
                        <span className="truncate text-[11px]">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Mensagem explicativa quando todos estão desmarcados */}
                {touristInterests.length === 0 ? (
                  <div className="p-3 rounded-2xl bg-blue-50/90 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 leading-snug">
                      <span className="font-extrabold text-blue-900 block text-[11px]">
                        Roteiro equilibrado automático
                      </span>
                      <p className="text-[11px] text-blue-800">
                        Como nenhum estilo está marcado, o aplicativo gera automaticamente os <strong>pontos normais</strong> (gastronomia típica, museus, parques e cidades históricas) próximos da sua localização para o tempo de <strong>{customHours}h</strong>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Foco do roteiro direcionado aos estilos marcados acima.</span>
                  </div>
                )}
              </div>

              {/* Botão de Gerar Roteiro por Horas */}
              <button
                type="submit"
                disabled={!currentVehicle || isGenerating}
                className="w-full py-3.5 px-4 rounded-2xl disabled:opacity-50 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer min-h-[44px]"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  Gerar Roteiro Turístico de {customHours}h ({tripType === 'round_trip' ? 'Passear e Voltar' : 'Só Ida'})
                </span>
              </button>
            </form>
          )}

          {/* ======================================================== */}
          {/* MODO 3: COM DESTINO FIXO (ORIGEM E DESTINO TRADICIONAIS) */}
          {/* ======================================================== */}
          {plannerMode === 'destino' && (
            <form onSubmit={handleDestinationSubmit} className="space-y-4 animate-in fade-in">
              {/* Botão Traçar Rota com Destino */}
              <button
                type="submit"
                disabled={!currentVehicle || !origin.trim() || !destination.trim()}
                className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all min-h-[44px] ${
                  !origin.trim() || !destination.trim()
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>
                  {destination.trim() 
                    ? `Traçar Rota até ${destination.split('-')[0].trim()}` 
                    : 'Digite um Destino para Traçar Rota'}
                </span>
              </button>

              {/* Sugestões de Destinos Populares */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Cidades Populares:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {PRESET_DESTINATIONS.slice(0, 4).map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-xl border whitespace-nowrap transition-colors shrink-0 ${
                        destination.includes(p.name)
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* PROMINENT CARD TO OPEN FULL-SCREEN MAP TAB */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-5 text-white shadow-xl flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
              Navegação Visual
            </span>
            <h3 className="text-sm font-extrabold mt-0.5">
              Explorar Mapa em Tela Cheia
            </h3>
            <p className="text-[11px] text-emerald-100/90 mt-1 leading-snug">
              Visualize satélite real, curvas de relevo, camadas de chuva e mirantes.
            </p>
          </div>
          <button
            onClick={onNavigateToMapTab}
            className="py-2.5 px-4 rounded-2xl bg-white text-emerald-900 font-extrabold text-xs shadow-md hover:bg-emerald-50 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <MapIcon className="w-4 h-4 text-emerald-700" />
            <span>Abrir Mapa</span>
          </button>
        </div>
      </div>

      {/* QUICK VEHICLE SWITCHER MODAL (Requirement #4) */}
      {showVehicleSwitcher && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-emerald-600" />
                  <span>Trocar Veículo Ativo</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Atualiza automaticamente o consumo e cálculo de combustível nas rotas.
                </p>
              </div>
              <button 
                onClick={() => setShowVehicleSwitcher(false)} 
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {vehicles.map((v) => {
                const isSelected = v.id === currentVehicle?.id;
                const isMoto = v.type === 'motorcycle';
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      onSelectVehicle(v.id);
                      setShowVehicleSwitcher(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">
                        {isMoto ? '🏍️' : '🚗'}
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <span>{v.nickname}</span>
                          {isSelected && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-600 text-white">
                              EM USO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {v.brand} {v.model} ({v.year})
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <strong className="text-xs font-bold text-emerald-800 block">
                        {v.consumption.userConfigured} km/l
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        {v.tankCapacityLiters}L tanque
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

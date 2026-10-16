import React, { useMemo, useState } from 'react';
import { ChevronRight, Clock3, Compass, Crosshair, MapPin, Navigation, Search, X, Route } from 'lucide-react';
import type { Vehicle, TripPlan } from '../types';
import type { Place } from '../types/admin';
import { TOURIST_PLACE_KINDS } from '../types/admin';
import type { LocationSelection } from '../types/itinerary';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { getCurrentDeviceLocation } from '../services/locationService';
import { getTouristTargetError, getTouristTargetWarning, parseTouristTarget } from '../services/touristTargetInput';
import { createRoadDraft, generateVerifiedTouristCircuit } from '../services/touristCircuit';
import { prepareRoadPreview } from '../services/itinerary';
import { requestTolls, tollBudgetPatch } from '../services/routeConditions';
import { useEffect } from 'react';
import { isNativeApp, TravelNative } from '../services/nativeApp';
import { InteractiveMap } from './InteractiveMap';
import { RoadAlertReporter } from './RoadAlertReporter';
import { LocationSearch } from './LocationSearch';
import { DestinationExplorer } from './DestinationExplorer';

interface NavigationHomeProps {
  currentVehicle: Vehicle | null;
  trips: TripPlan[];
  onLaunchTouristCircuit: (trip: TripPlan) => void;
  onStartTrip: (trip: TripPlan) => void;
  onOpenAllTrips: () => void;
  onOpenAllSuggestions: () => void;
  onOpenProfile: () => void;
  onAdvancedPlanning: () => void;
  onViewTripDetails: (trip: TripPlan) => void;
}
type CircuitMode = 'km' | 'hours';
const touristKinds: readonly string[] = TOURIST_PLACE_KINDS;

export function NavigationHome(props: NavigationHomeProps) {
  const gps = useDeviceLocation(true, 'role-home');
  const liveCoords = gps.status === 'ready' ? gps.position?.coords : undefined;
  const places = useNearbyPlaces(liveCoords ? [liveCoords] : [], Boolean(liveCoords));
  const recent = useMemo(() => [...props.trips].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5), [props.trips]);
  const suggested = useMemo(() => places.filter(place => touristKinds.includes(place.kind)).slice(0,5), [places]);
  const [sheet, setSheet] = useState<'km'|'hours'|'destination'|'search'|null>(null);
  const [preview, setPreview] = useState<TripPlan|null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [searchPlace,setSearchPlace] = useState<LocationSelection>({name:''});
  const [mapTarget,setMapTarget] = useState<LocationSelection|null>(null);
  const [displayRoute,setDisplayRoute] = useState<{origin:[number,number];path:[number,number][]}|null>(null);
  const [centerRequest,setCenterRequest] = useState(0);
  const [km, setKm] = useState('150'), [hours, setHours] = useState('3');
  const [tripType, setTripType] = useState<'round_trip'|'one_way'>('round_trip');
  const [preference, setPreference] = useState<'tranquila'|'curvas'|'cidades'>('tranquila');
  const [origin, setOrigin] = useState<LocationSelection>({name:''});
  const [dest, setDest] = useState<LocationSelection>({name:''});
  const [useGps, setUseGps] = useState(true);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tollNotice, setTollNotice] = useState('');
  // Carrega pedágios após abrir a prévia, sem confundir ausência de dados com rota sem cobrança.
  useEffect(() => {
    if (!preview || preview.routePath.length < 2 || !props.currentVehicle || preview.tolls?.length) return;
    const controller = new AbortController();
    setTollNotice('');
    void requestTolls(preview, props.currentVehicle.type, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setPreview(current => current?.id === preview.id ? { ...current, ...tollBudgetPatch(current, result) } : current);
        if (result.mapUnavailable) setTollNotice('Cobertura de pedágios indisponível. Confira os valores antes de viajar.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setTollNotice('Não foi possível consultar os pedágios. Confira-os antes de viajar.');
      });
    return () => controller.abort();
  }, [preview?.id, props.currentVehicle?.type]);

  const showSheet = (value:'km'|'hours'|'destination'|'search') => {setError('');setSheet(value);};
  const closeSheet = () => { if (busy) return; setSheet(null);setPreview(null);setError(''); };
  const currentValue = sheet === 'km' ? km : hours;
  const validation = sheet === 'km' || sheet === 'hours' ? getTouristTargetError(sheet, currentValue) : '';
  const warning = sheet === 'km' || sheet === 'hours' ? getTouristTargetWarning(sheet, currentValue) : '';
  const requireVehicle = () => {
    if (props.currentVehicle) return true;
    setError('Cadastre seu carro ou sua moto em Perfil → Minha Garagem para criar um roteiro.');
    return false;
  };
  const gpsCoordinates = async (): Promise<[number,number]> => {
    // A posição já fornecida pelo rastreador evita uma segunda leitura GPS desnecessária.
    const tracked = gps.status === 'ready' ? gps.position : null;
    if (tracked && Date.now() - tracked.timestamp >= -5000
      && Date.now() - tracked.timestamp < 30000 && tracked.accuracyMeters <= 100) {
      return tracked.coords;
    }
    const position = await getCurrentDeviceLocation();
    if (position.accuracyMeters > 150) throw new Error('O sinal GPS está impreciso. Tente novamente em local aberto.');
    return position.coords;
  };
  const submitCircuit = async () => {
    if (busy || (sheet !== 'km' && sheet !== 'hours') || !requireVehicle()) return;
    const mode = sheet as CircuitMode;
    const value = mode === 'km' ? km : hours;
    const issue = getTouristTargetError(mode,value);
    if (issue) {setError(issue);return;}
    const target = parseTouristTarget(value);
    if (target === null) return;
    setError('');setBusy(true);
    try {
      const coords = await gpsCoordinates();
      const interests = preference === 'curvas' ? ['mirante','parque'] :
        preference === 'cidades' ? ['museu','cidade_historica'] : [];
      const trip = await generateVerifiedTouristCircuit({ mode, target, tripType,
        originName:'Sua localização atual',originCoords:coords,
        interests,vehicle:props.currentVehicle! });
      setSheet(null);
      props.onLaunchTouristCircuit(trip);
    } catch (err) {setError((err as Error).message);} finally {setBusy(false);}
  };
  const submitDestination = async () => {
    if (busy || !dest.coords || (!useGps && !origin.coords) || !requireVehicle()) return;
    setError('');setBusy(true);
    try {
      const originCoords = useGps ? await gpsCoordinates() : origin.coords!;
      const draft = createRoadDraft({originName:useGps?'Sua localização atual':origin.name,
        originCoords,destinationName:dest.name,destinationCoords:dest.coords,
        vehicle:props.currentVehicle!,circular:false,limits:{mode:'destination'}});
      const trip = await prepareRoadPreview(draft, props.currentVehicle!);
      setSheet(null); setPreview(trip);
    } catch (err) {setError((err as Error).message);} finally {setBusy(false);}
  };
  const suggestDestination = async (place:Place) => {
    if(busy || !requireVehicle())return;
    setBusy(true);setError('');
    try {
      const originCoords = await gpsCoordinates();
      const draft = createRoadDraft({originName:'Sua localização atual',originCoords,
        destinationName:place.name,destinationCoords:[place.lat,place.lng],
        vehicle:props.currentVehicle!,circular:false,limits:{mode:'destination'}});
      const trip = await prepareRoadPreview(draft, props.currentVehicle!);
      setPreview(trip);
    } catch(err) {setError((err as Error).message);} finally {setBusy(false);}
  };
  const selectMapTarget = (place:LocationSelection) => {
    setSearchPlace(place);
    if (!place.coords) return;
    setMapTarget(place);setDisplayRoute(null);setSheet(null);setCollapsed(true);setError('');
  };
  const stepValue = (increase:boolean) => {
    const amount = sheet === 'km' ? 10 : 0.5;
    const n = Math.max(sheet === 'km' ? 1 : 0.1,(parseTouristTarget(currentValue) || 0) + (increase ? amount : -amount));
    if(sheet === 'km')setKm(String(n));else setHours(String(n));
  };
  return <div className="relative bg-white h-[100dvh] overflow-hidden" aria-label="Início do Rolê">
    <div className={`absolute top-0 inset-x-0 rdv-flat-map ${collapsed?'bottom-0':'h-[42dvh] min-h-[260px]'}`}>
      <InteractiveMap roadStyle followUser={false} userLiveCoords={liveCoords}
        destinationCoords={mapTarget?.coords} destinationLabel={mapTarget?.name}
        focusedCoords={mapTarget?.coords} originCoords={displayRoute?.origin} routePath={displayRoute?.path || []}
        blueRoute centerOnUserRequest={centerRequest} showFuelStations className="w-full h-full" />
    </div>
    {/* Ações rápidas disponíveis também no Início: GPS acima, triângulo de alerta embaixo. */}
    <div aria-label="Controles de localização e ocorrência no início"
      className="absolute top-[70px] right-4 z-40 flex flex-col items-center gap-3">
      <button type="button" aria-label="Atualizar GPS" onClick={()=>{gps.retry();setCenterRequest(value=>value+1);}}
        className="w-12 h-12 rounded-full shadow-[0_4px_18px_rgba(15,23,42,.16)] bg-white text-blue-700 border border-slate-200 flex items-center justify-center">
        <Crosshair size={22} strokeWidth={2.2}/>
      </button>
      <RoadAlertReporter
        location={gps.status === 'ready' ? gps.position : null}
        speedKmH={gps.status === 'ready' && gps.position?.speedMetersPerSecond != null
          ? gps.position.speedMetersPerSecond * 3.6 : null}
        menuPlacement="below"
      />
    </div>
    <div className={`absolute left-4 z-30 rounded-full bg-white border-4 border-sky-500 shadow-lg w-[74px] h-[74px] flex flex-col justify-center items-center ${collapsed?'bottom-28':'top-[24dvh]'}`}
      role="status" aria-label="Velocímetro">
      <strong className="text-2xl leading-none tabular-nums">{gps.position?.speedMetersPerSecond == null ? '0' : Math.round(gps.position.speedMetersPerSecond*3.6)}</strong>
      <small className="text-[10px] text-slate-500 font-bold">km/h</small>
    </div>
    <div className={`absolute bottom-0 inset-x-0 z-30 rounded-t-[30px] bg-white shadow-[0_-9px_28px_rgba(15,23,42,.12)] border-t border-white/80 flex flex-col transition-[height] duration-200 ${collapsed?'h-[74px]':'h-[62dvh] min-h-[440px]'}`}>
      <button type="button" aria-label={collapsed?'Expandir início':'Recolher para explorar o mapa'} onClick={()=>setCollapsed(c=>!c)}
        className="mx-auto w-16 h-9 flex items-center justify-center shrink-0" >
        <span className="bg-slate-300 rounded-full w-11 h-1.5"/>
      </button>
      {!collapsed && <div className="flex-1 w-full max-w-xl mx-auto overflow-y-auto px-4 sm:px-5 pb-8 space-y-6">
        <button type="button" aria-label="Para onde quer ir?" onClick={()=>showSheet('search')}
          className="rounded-[18px] w-full bg-slate-100 border border-slate-100 px-4 py-3.5 flex items-center gap-3 text-slate-600 text-sm text-left min-h-[56px] focus-visible:ring-2 focus-visible:ring-blue-400">
          <Search size={21} strokeWidth={2} className="shrink-0 text-slate-600"/>
          <span className="flex-1 font-medium">Para onde quer ir?</span>
          <ChevronRight size={19} className="text-slate-500"/>
        </button>
        {gps.error && <p role="alert" className="bg-amber-50 p-3 rounded-xl text-xs text-amber-900">{gps.error} <button className="underline font-bold" onClick={()=>isNativeApp()?void TravelNative.openDeviceSettings({section:'app'}):gps.retry()}>Permitir localização</button></p>}
        {error && <p role="alert" className="bg-rose-50 p-3 rounded-xl text-xs text-rose-700">{error}</p>}
        <section className="space-y-3">
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-.035em] text-slate-950">Dar um rolê por aí?</h2>
            <p className="text-[12px] mt-1 text-slate-500 leading-relaxed">Não sabe para onde ir e só quer andar? Escolha a distância ou o tempo, que eu monto o trajeto para você.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={()=>showSheet('km')}
              className="group bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-[20px] p-3.5 min-h-[156px] flex flex-col items-start gap-1 text-left shadow-[0_2px_6px_rgba(37,99,235,.03)] active:scale-[.98] transition-transform">
              <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-1">
                <Navigation size={21} strokeWidth={2.2}/>
              </span>
              <strong className="text-blue-800 text-[14px] block tracking-tight">Por distância</strong>
              <span className="text-slate-600 text-[11px] leading-snug flex-1">Quantos KM gostaria de percorrer?</span>
              <span className="w-full bg-blue-600 text-white rounded-[12px] h-8 flex items-center justify-center text-[11px] font-bold mt-1 gap-1">
                Escolher KM <ChevronRight size={13}/>
              </span>
            </button>
            <button type="button" onClick={()=>showSheet('hours')}
              className="group bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-[20px] p-3.5 min-h-[156px] flex flex-col items-start gap-1 text-left shadow-[0_2px_6px_rgba(22,163,74,.03)] active:scale-[.98] transition-transform">
              <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1">
                <Clock3 size={21} strokeWidth={2.2}/>
              </span>
              <strong className="text-emerald-800 text-[14px] block tracking-tight">Por tempo</strong>
              <span className="text-slate-600 text-[11px] leading-snug flex-1">Quantas horas gostaria de passear?</span>
              <span className="w-full bg-emerald-600 text-white rounded-[12px] h-8 flex items-center justify-center text-[11px] font-bold mt-1 gap-1">
                Escolher horas <ChevronRight size={13}/>
              </span>
            </button>
          </div>
          <button type="button" onClick={()=>showSheet('destination')} className="w-full text-left bg-white border border-slate-200 rounded-[18px] p-3.5 flex items-center gap-3 shadow-[0_2px_8px_rgba(15,23,42,.035)]">
            <span className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-blue-700"><Route size={21} strokeWidth={1.9}/></span>
            <span className="flex-1"><strong className="text-[13px] block text-slate-900">Rolê com origem e destino</strong><small className="text-[11px] text-slate-500">Escolha de onde sair e aonde chegar</small></span><ChevronRight size={17} className="text-slate-400"/>
          </button>
        </section>
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-[16px] font-extrabold tracking-tight text-slate-950">Viagens recentes</h2><button type="button" className="text-blue-600 text-xs font-semibold shrink-0" onClick={props.onOpenAllTrips}>Ver todas <ChevronRight size={14} className="inline"/></button></div>
          {recent.length===0 && <p className="text-xs bg-slate-50 text-slate-500 rounded-2xl p-4">Seus passeios aparecerão aqui quando você criar uma rota.</p>}
          {recent.map(trip=><button type="button" key={trip.id} onClick={()=>setPreview(trip)} className="w-full p-3 border rounded-[18px] border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,.035)] flex gap-3 text-left items-center min-h-[68px]">
            <span className="w-12 h-12 bg-blue-50 rounded-[13px] text-blue-600 flex shrink-0 items-center justify-center"><MapPin size={23}/></span>
            <span className="flex-1 min-w-0"><strong className="text-[13px] truncate block text-slate-900">{trip.destinationName}</strong>
              <span className="text-[11px] text-slate-500">{trip.distanceKm.toFixed(0)} km · {Math.floor(trip.durationMinutes/60)}h {Math.round(trip.durationMinutes%60)}min</span>
              <span className="text-[10px] text-slate-400 block">{new Date(trip.createdAt).toLocaleDateString('pt-BR')}</span></span><ChevronRight size={17} className="text-slate-400"/>
          </button>)}
        </section>
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-[16px] font-extrabold tracking-tight text-slate-950">Viagens sugeridas</h2><button type="button" className="text-blue-600 text-xs font-semibold shrink-0" onClick={props.onOpenAllSuggestions}>Ver todas <ChevronRight size={14} className="inline"/></button></div>
          {suggested.length===0 && <p className="text-xs bg-slate-50 text-slate-500 rounded-2xl p-4">{liveCoords?'Ainda não há pontos turísticos cadastrados próximos.':'Ative o GPS para descobrir pontos turísticos reais próximos.'}</p>}
          {suggested.map(place=><button type="button" key={place.id} disabled={busy} onClick={()=>void suggestDestination(place)} className="w-full p-3 border rounded-[18px] border-slate-200 bg-white shadow-[0_2px_7px_rgba(15,23,42,.035)] flex gap-3 text-left items-center min-h-[68px] disabled:opacity-50">
            <span className="w-12 h-12 bg-emerald-50 rounded-[13px] text-emerald-700 flex shrink-0 items-center justify-center"><Compass size={23}/></span>
            <span className="flex-1 min-w-0"><strong className="text-[13px] truncate block text-slate-900">{place.name}</strong><small className="text-[11px] text-slate-500 truncate block">{place.address||'Atração turística cadastrada'}</small></span><ChevronRight size={17} className="text-slate-400"/>
          </button>)}
        </section>
        <button type="button" onClick={props.onAdvancedPlanning} className="w-full py-2 text-blue-700 underline text-xs font-semibold">Mais opções de planejamento</button>
      </div>}
    </div>
    {mapTarget?.coords && <DestinationExplorer key={mapTarget.id || mapTarget.name} target={mapTarget} vehicle={props.currentVehicle}
      gpsAvailable={Boolean(liveCoords)} getOrigin={gpsCoordinates} onStartTrip={props.onStartTrip}
      onMapRoute={(origin,path)=>setDisplayRoute({origin,path})}
      onClose={()=>{setMapTarget(null);setDisplayRoute(null);setCollapsed(false);}} />}
    {(sheet!==null || preview!==null) && <div role="presentation" className="fixed inset-0 z-[70] bg-slate-950/55 flex items-end" onMouseDown={event=>{if(event.target===event.currentTarget)closeSheet();}}>
      <section role="dialog" aria-modal="true" aria-label={preview?'Visualizar viagem':sheet==='search'?'Buscar destino no mapa':sheet==='destination'?'Escolher origem e destino':'Criar um rolê'} className={`bg-white rounded-t-[30px] w-full max-w-xl mx-auto flex flex-col ${preview?'h-[88dvh]':'max-h-[90dvh]'} overflow-hidden shadow-2xl`}>
        <div className="flex justify-end p-4 shrink-0"><button type="button" aria-label="Fechar janela" onClick={closeSheet} className="text-slate-500"><X size={20}/></button></div>
        {preview ? <div className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 min-h-36 rdv-flat-map"><InteractiveMap originCoords={preview.originCoords} destinationCoords={preview.destinationCoords} routePath={preview.routePath} navigationMode={false} blueRoute showFuelStations tolls={preview.tolls||[]} tollVehicleType={props.currentVehicle?.type} stops={preview.stops} className="w-full h-full" /></div>
          <div className="p-5 space-y-3 shrink-0"><h2 className="font-extrabold text-xl">{preview.destinationName}</h2><p className="text-sm text-slate-500">{preview.distanceKm.toFixed(1)} km · {Math.round(preview.durationMinutes)} min · {preview.stops.length} paradas</p>
            <p className="text-[11px] text-slate-500">Percurso por estradas reais. Os postos e os pontos turísticos disponíveis aparecem no mapa.</p>
            {tollNotice && <p role="status" className="text-xs text-amber-800">{tollNotice}</p>}
            {preview.routeWarnings?.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
            {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
            <div className="flex gap-2"><button className="border border-blue-600 text-blue-700 rounded-xl py-3 flex-1 font-bold text-sm" onClick={()=>{props.onViewTripDetails(preview);setPreview(null);}}>Detalhes</button>
              <button className="rounded-xl bg-blue-600 text-white py-3 flex-1 font-bold text-sm" onClick={()=>{props.onStartTrip(preview);setPreview(null);}}>Iniciar</button></div>
          </div>
        </div> : sheet==='search' ? <div className="p-5 pt-1 space-y-4 overflow-y-auto">
          <h2 className="text-xl font-extrabold">Para onde quer ir?</h2>
          <p className="text-xs text-slate-600">Escolha um endereço para abrir diretamente no mapa, sem iniciar o planejamento de viagem.</p>
          <LocationSearch label="Buscar endereço" value={searchPlace} onChange={selectMapTarget} bias={liveCoords} placeholder="Cidade, rua, endereço ou atração" />
        </div> : sheet==='destination' ? <div className="p-5 pt-1 space-y-4 overflow-y-auto">
          <h2 className="text-xl font-extrabold">Rolê com origem e destino</h2>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={useGps} onChange={e=>setUseGps(e.target.checked)} /> Sair da minha localização (GPS)</label>
          {!useGps && <LocationSearch label="Origem" value={origin} onChange={setOrigin} bias={liveCoords} />}
          <LocationSearch label="Destino" value={dest} onChange={setDest} bias={liveCoords} placeholder="Cidade, endereço, parque ou restaurante" />
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          {!props.currentVehicle && <button type="button" className="text-xs font-bold underline text-blue-700" onClick={()=>{closeSheet();props.onOpenProfile();}}>Cadastrar meu veículo no Perfil</button>}
          <button type="button" onClick={()=>void submitDestination()} disabled={busy || !dest.coords || (!useGps && !origin.coords)} className="w-full p-4 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{busy?'Calculando...':'Ver percurso'}</button>
        </div> : <div className="p-5 pt-1 space-y-5 overflow-y-auto">
          <h2 className="font-extrabold text-xl">Quanto você quer percorrer?</h2>
          <div className="flex bg-slate-100 rounded-full p-1 gap-1 text-sm">
            <button type="button" onClick={()=>setSheet('km')} className={`py-2 flex-1 rounded-full font-bold ${sheet==='km'?'bg-blue-600 text-white':'text-slate-600'}`}>Distância (KM)</button>
            <button type="button" onClick={()=>setSheet('hours')} className={`py-2 flex-1 rounded-full font-bold ${sheet==='hours'?'bg-emerald-600 text-white':'text-slate-600'}`}>Tempo (Horas)</button>
          </div>
          <div className="flex gap-3 items-center justify-center">
            <button type="button" aria-label="Diminuir quantidade" className="bg-slate-100 rounded-full w-10 h-10" onClick={()=>stepValue(false)}>−</button>
            <label className="flex items-baseline gap-1"><input type="text" inputMode="decimal" aria-label={sheet==='km'?'Quantidade de quilômetros':'Quantidade de horas'} className="text-center font-extrabold text-3xl w-24 outline-none" value={currentValue} onChange={e=>sheet==='km'?setKm(e.target.value):setHours(e.target.value)}/><span className="text-sm text-slate-500">{sheet==='km'?'km':'h'}</span></label>
            <button type="button" aria-label="Aumentar quantidade" className="bg-slate-100 rounded-full w-10 h-10" onClick={()=>stepValue(true)}>+</button>
          </div>
          <input aria-label="Ajustar distância ou tempo" type="range" min={sheet==='km'?1:0.5} max={sheet==='km'?500:12} step={sheet==='km'?1:0.5} value={Math.max(sheet==='km'?1:0.5,Math.min(sheet==='km'?500:12,parseTouristTarget(currentValue)||1))}
            onChange={e=>sheet==='km'?setKm(e.target.value):setHours(e.target.value)} className={`w-full ${sheet==='km'?'accent-blue-600':'accent-emerald-600'}`}/>
          <div className="grid grid-cols-2 gap-2 text-xs"><button className={`border rounded-xl p-3 ${tripType==='round_trip'?'border-blue-500 bg-blue-50':''}`} onClick={()=>setTripType('round_trip')}>Ida e volta</button><button className={`border rounded-xl p-3 ${tripType==='one_way'?'border-blue-500 bg-blue-50':''}`} onClick={()=>setTripType('one_way')}>Só ida</button></div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">{([['tranquila','Rota tranquila'],['curvas','Mais curvas'],['cidades','Cidades turísticas']] as const).map(([id,label])=><button type="button" key={id} onClick={()=>setPreference(id)} className={`border rounded-xl p-2 ${preference===id?'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold':''}`}>{label}</button>)}</div>
          <p className="p-3 rounded-xl text-xs text-slate-600 bg-slate-50">Eu monto o trajeto usando sua localização e estradas reais.</p>
          {warning && <p className="text-rose-700 text-xs">{warning}</p>}{validation && <p className="text-rose-700 text-xs">{validation}</p>}{error && <p role="alert" className="text-rose-700 text-xs">{error}</p>}
          {!props.currentVehicle && <button onClick={()=>{closeSheet();props.onOpenProfile();}} className="text-blue-700 underline font-bold text-xs">Cadastrar meu veículo no Perfil</button>}
          <button type="button" disabled={Boolean(validation)||busy} onClick={()=>void submitCircuit()} className={`rounded-xl text-white py-4 w-full font-bold ${sheet==='km'?'bg-blue-600':'bg-emerald-600'} disabled:opacity-50`}>{busy?'Gerando percurso...':'Gerar rota'}</button>
        </div>}
      </section>
    </div>}
  </div>;
}

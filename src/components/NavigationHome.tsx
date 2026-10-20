import React, { useMemo, useState } from 'react';
import { ChevronRight, Clock3, Compass, Crosshair, MapPin, Navigation, Search, X, Route, Users } from 'lucide-react';
import type { Vehicle, TripPlan } from '../types';
import type { Place } from '../types/admin';
import { TOURIST_PLACE_KINDS } from '../types/admin';
import type { LocationSelection } from '../types/itinerary';
import type { VerifiedRouteChoice } from '../services/routeChoices';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useGpsPermissionAction } from '../hooks/useGpsPermissionAction';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { getCurrentDeviceLocation } from '../services/locationService';
import { getTouristTargetError, getTouristTargetWarning, parseTouristTarget } from '../services/touristTargetInput';
import { createRoadDraft, generateVerifiedTouristCircuit } from '../services/touristCircuit';
import { GUEST_NAVIGATION_VEHICLE } from '../services/guestNavigationVehicle';
import { prepareRoadPreview } from '../services/itinerary';
import { requestTolls, tollBudgetPatch } from '../services/routeConditions';
import { useEffect } from 'react';
import { InteractiveMap } from './InteractiveMap';
import { Speedometer } from './Speedometer';
import { RoadAlertReporter } from './RoadAlertReporter';
import { LocationSearch } from './LocationSearch';
import { fuelApi } from '../services/fuelApi';
import { DestinationExplorer } from './DestinationExplorer';
import { draggedHomeSheetHeight, type HomeSheetStage } from '../services/homeSheetSizing';
import { destinationExploreKey } from '../services/destinationIdentity';
import { CreateConvoyModal } from './CreateConvoyModal';
import { ConvoyActionModal } from './ConvoyActionModal';
import { CreateTouristCircuitScreen } from './CreateTouristCircuitScreen';
import { TripPreviewScreen } from './TripPreviewScreen';

interface NavigationHomeProps {
  currentVehicle: Vehicle | null;
  trips: TripPlan[];
  onStartTrip: (trip: TripPlan) => void;
  onSaveTrip: (trip: TripPlan) => void;
  onOpenAllTrips: () => void;
  onOpenAllSuggestions: () => void;
  onOpenProfile: () => void;
  onAdvancedPlanning: () => void;
  onViewTripDetails: (trip: TripPlan) => void;
  signedIn: boolean;
  onLogin: () => void;
  onCreateConvoy: (trip: TripPlan, title: string) => Promise<boolean>;
  onJoinConvoy: () => void;
}
type CircuitMode = 'km' | 'hours';
const touristKinds: readonly string[] = TOURIST_PLACE_KINDS;

export function NavigationHome(props: NavigationHomeProps) {
  const gps = useDeviceLocation(true, 'role-home');
  const locationAccess = useGpsPermissionAction(gps.retry);
  const liveCoords = gps.status === 'ready' ? gps.position?.coords : undefined;
  const places = useNearbyPlaces(liveCoords ? [liveCoords] : [], Boolean(liveCoords));
  const recent = useMemo(() => [...props.trips].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5), [props.trips]);
  const suggested = useMemo(() => places.filter(place => touristKinds.includes(place.kind)).slice(0,5), [places]);
  const [sheet, setSheet] = useState<'km'|'hours'|'destination'|null>(null);
  const [lastCircuitMode,setLastCircuitMode] = useState<CircuitMode>('km');
  const [travelMode,setTravelMode] = useState<'car'|'motorcycle'>(props.currentVehicle?.type==='motorcycle'?'motorcycle':'car');
  useEffect(()=>{if(props.currentVehicle)setTravelMode(props.currentVehicle.type);},[props.currentVehicle?.id,props.currentVehicle?.type]);
  const [preview, setPreview] = useState<TripPlan|null>(null);
  const [circuitPreviewId,setCircuitPreviewId] = useState<string|null>(null);
  const circuitHistory = React.useRef<[number,number][][]>([]);
  const [showCreateConvoy, setShowCreateConvoy] = useState(false);
  const [showConvoyActions, setShowConvoyActions] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchPlace,setSearchPlace] = useState<LocationSelection>({name:''});
  const [searchBusy,setSearchBusy] = useState(false);
  const [searchError,setSearchError] = useState('');
  const searchGeneration = React.useRef(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [mapTarget,setMapTarget] = useState<LocationSelection|null>(null);
  const [displayRoute,setDisplayRoute] = useState<{origin:[number,number];options:VerifiedRouteChoice[];selectedId:string}|null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const dragStart = React.useRef<number|null>(null);
  const swallowNextClick = React.useRef(false);
  const [dragOffset,setDragOffset]=useState(0);
  const finishPanelDrag = (event:React.PointerEvent<HTMLDivElement>) => {
    if(dragStart.current===null)return;
    const delta=event.clientY-dragStart.current;
    dragStart.current=null;
    setDragOffset(0);
    if(Math.abs(delta)<38)return;
    swallowNextClick.current=true;
    // The click synthesized after pointerup is swallowed, not the next tap.
    window.setTimeout(()=>{swallowNextClick.current=false;},0);
    if(delta>0){if(sheetExpanded)setSheetExpanded(false);else setCollapsed(true);}
    else{if(collapsed)setCollapsed(false);else setSheetExpanded(true);}
  };
  // O painel inteiro acompanha o dedo, exceto botões, inputs e a lista rolável.
  const startPanelDrag = (event:React.PointerEvent<HTMLDivElement>)=>{
    if(!event.isPrimary)return;
    const target=event.target as HTMLElement;
    if(target.closest('input,textarea,select,a,[data-panel-scroll]'))return;
    if(target.closest('button')&&!target.closest('[data-panel-grip]'))return;
    dragStart.current=event.clientY;
    swallowNextClick.current=false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  useEffect(()=>{
    const close=(event:Event)=>{
      if(showCreateConvoy){(event as CustomEvent).preventDefault();setShowCreateConvoy(false);return;}
      if(showConvoyActions){(event as CustomEvent).preventDefault();setShowConvoyActions(false);return;}
      if(sheet || preview){(event as CustomEvent).preventDefault();closeSheet();return;}
      if(mapTarget){(event as CustomEvent).preventDefault();setMapTarget(null);setDisplayRoute(null);setCollapsed(false);return;}
      if(!collapsed){(event as CustomEvent).preventDefault();setCollapsed(true);}
    };
    window.addEventListener('rdv:close-overlay',close);
    return()=>window.removeEventListener('rdv:close-overlay',close);
  },[sheet,preview,mapTarget,collapsed,showCreateConvoy,showConvoyActions]);
  const [centerRequest,setCenterRequest] = useState(0);
  const centeredOnce=React.useRef(false);
  useEffect(()=>{if(liveCoords && !centeredOnce.current){centeredOnce.current=true;setCenterRequest(value=>value+1);}},[liveCoords?.[0],liveCoords?.[1]]);
  const [km, setKm] = useState('20'), [hours, setHours] = useState('2');
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

  const showSheet = (value:'km'|'hours'|'destination') => {setError('');setSheet(value);};
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
  const submitCircuit = async (regenerate = false) => {
    const selectedMode = regenerate ? lastCircuitMode : sheet;
    if (busy || (selectedMode !== 'km' && selectedMode !== 'hours') ||
      (regenerate && (!preview || preview.id !== circuitPreviewId))) return;
    const mode = selectedMode as CircuitMode;
    const value = mode === 'km' ? km : hours;
    const issue = getTouristTargetError(mode,value);
    if (issue) {setError(issue);return;}
    const target = parseTouristTarget(value);
    if (target === null) return;
    setError('');setBusy(true);
    try {
      const coords = await gpsCoordinates();
      const interests = preference === 'curvas' ? ['panoramico','natureza'] :
        preference === 'cidades' ? ['museus','historico'] : [];
      // A navegação turística é pública: nenhum login ou veículo salvo é exigido.
      // Sem veículo, a rota é real e navegável; consumo não é estimado.
      const avoided = regenerate ? circuitHistory.current : [];
      const trip = await generateVerifiedTouristCircuit({ mode, target, tripType,
        originName:'Sua localização atual',originCoords:coords,
        interests,avoidWaypoints:avoided,
        vehicle:props.currentVehicle?.type===travelMode ? props.currentVehicle : {...GUEST_NAVIGATION_VEHICLE,type:travelMode} });
      if (trip.routePath.length < 2 || trip.routingSource !== 'OSRM') {
        throw new Error('Não foi possível encontrar uma rota rodoviária válida. Tente novamente.');
      }
      // Atualiza o histórico somente após receber uma rota rodoviária válida.
      // Se esgotarem as alternativas, a prévia anterior permanece intacta.
      circuitHistory.current = [...avoided,...(trip.waypointOrder?.length ? [trip.waypointOrder] : [])].slice(-5);
      setLastCircuitMode(mode);
      setCircuitPreviewId(trip.id);
      setSheet(null);
      setPreview(trip);
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
    // Fecha o teclado antes de revelar o mapa e as opções de rotas.
    searchInputRef.current?.blur();
    setMapTarget(place);setDisplayRoute(null);setSheet(null);setCollapsed(true);setError('');setSearchError('');
  };
  const submitQuickSearch = async (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query=searchPlace.name.trim();
    if(query.length<3){setSearchError('Digite pelo menos 3 caracteres do destino.');return;}
    if(searchBusy)return;
    const generation=++searchGeneration.current;
    setSearchBusy(true);setSearchError('');
    try {
      const result=await fuelApi<{results:LocationSelection[];unavailable?:boolean}>(`/locations/search?q=${encodeURIComponent(query)}${liveCoords?`&lat=${liveCoords[0]}&lng=${liveCoords[1]}`:''}`);
      if(generation!==searchGeneration.current)return;
      const found=result.results.find(place=>place.coords && place.coords.length===2 && place.coords.every(Number.isFinite));
      if(!found)throw new Error('Nenhum destino encontrado. Informe também a cidade ou um endereço mais completo.');
      selectMapTarget(found);
    }catch(err){if(generation===searchGeneration.current)setSearchError((err as Error).message);}
    finally{if(generation===searchGeneration.current)setSearchBusy(false);}
  };
  const stepValue = (increase:boolean) => {
    const amount = sheet === 'km' ? 1 : 0.5;
    const n = Math.max(sheet === 'km' ? 1 : 0.1,(parseTouristTarget(currentValue) || 0) + (increase ? amount : -amount));
    if(sheet === 'km')setKm(String(n));else setHours(String(n));
  };
  const sheetStage:HomeSheetStage=collapsed?'collapsed':sheetExpanded?'expanded':'resting';
  const sheetDragHeight=draggedHomeSheetHeight(sheetStage,dragOffset);
  // Controles ancorados à área do mapa, nunca à altura nem ao arraste do painel.
  return <div className="relative bg-[#eaf0ef] h-[100dvh] overflow-hidden rdv-navigation-screen" aria-label="Início do Rolê">
    <div className="absolute inset-0 rdv-flat-map">
      <InteractiveMap roadStyle followUser={false} userLiveCoords={liveCoords}
        userHeadingDegrees={gps.status==='ready'?gps.position?.headingDegrees:null}
        userSpeedMetersPerSecond={gps.status==='ready'?gps.position?.speedMetersPerSecond:null} onSelectCoordinates={()=>{setCollapsed(true);setSheetExpanded(false);}}
        destinationCoords={mapTarget?.coords} destinationLabel={mapTarget?.name}
        focusedCoords={mapTarget?.coords} originCoords={displayRoute?.origin} routePath={displayRoute?.options.find(choice=>choice.id===displayRoute?.selectedId)?.routePath || []}
        routeAlternatives={displayRoute?.options || []} selectedRouteId={displayRoute?.selectedId}
        onSelectRoute={id=>setDisplayRoute(current=>current?{...current,selectedId:id}:current)}
        blueRoute centerOnUserRequest={centerRequest} showFuelStations className="w-full h-full" />
    </div>
<form role="search" aria-label="Busca rápida de destinos" onSubmit={event=>void submitQuickSearch(event)}
          className="rdv-figma-home-search">
          <Search size={21} strokeWidth={2} className="shrink-0 text-slate-600" aria-hidden="true"/>
          <input ref={searchInputRef} type="search" enterKeyHint="search" autoComplete="off" maxLength={150}
            aria-label="Para onde quer ir?" placeholder="Buscar destino ou lugar" value={searchPlace.name}
            onChange={event=>{searchGeneration.current++;setSearchBusy(false);setSearchError('');setSearchPlace({name:event.target.value});}}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium text-slate-900 placeholder:text-slate-600"/>
          <button type="submit" aria-label="Pesquisar destino" disabled={searchBusy || searchPlace.name.trim().length<3}
            className="w-9 h-9 rounded-xl text-blue-600 disabled:text-slate-400 flex items-center justify-center">
            {searchBusy?<span className="text-xs font-bold">...</span>:<ChevronRight size={20}/>}
          </button>
        </form>
        {searchError && <p role="alert" className="bg-rose-50 text-rose-700 rounded-xl px-3 py-2 text-xs">{searchError}</p>}
    <div className="rdv-figma-home-modes" role="group" aria-label="Modalidade de transporte">
      <button type="button" aria-pressed={travelMode==='car'}
        className={`rdv-figma-mode ${travelMode==='car'?'is-current':''}`}
        onClick={()=>setTravelMode('car')}><Navigation size={15}/> Carro</button>
      <button type="button" aria-pressed={travelMode==='motorcycle'}
        className={`rdv-figma-mode ${travelMode==='motorcycle'?'is-current':''}`}
        onClick={()=>setTravelMode('motorcycle')}><Navigation size={15}/> Moto</button>
    </div>
        {/* Coluna fixada à área do mapa; o sheet sobe por cima sem deslocá-la. */}
    <div aria-label="Controles de localização e ocorrência no início"
      className="rdv-home-map-right-controls">
      <button type="button" aria-label="Atualizar GPS" onClick={()=>{if(gps.status==='ready'){setCenterRequest(value=>value+1);}else{void locationAccess.request().then(granted=>{if(granted)setCenterRequest(value=>value+1);});}}}
        className="w-12 h-12 rounded-full shadow-[0_4px_18px_rgba(15,23,42,.16)] bg-white text-blue-700 border border-slate-200 flex items-center justify-center">
        <Crosshair size={22} strokeWidth={2.2}/>
      </button>
      <RoadAlertReporter
        location={gps.status === 'ready' ? gps.position : null}
        speedKmH={gps.status === 'ready' && gps.position?.speedMetersPerSecond != null
          ? gps.position.speedMetersPerSecond * 3.6 : null}
        menuPlacement="above"
      />
    </div>
    <Speedometer position={gps.status === 'ready' ? gps.position : null}
      className="rdv-home-map-speedometer" />
    <div data-testid="home-main-sheet"
      onPointerDown={startPanelDrag}
      onPointerMove={event=>{if(dragStart.current!==null)setDragOffset(Math.max(-180,Math.min(260,event.clientY-dragStart.current)));}}
      onPointerUp={finishPanelDrag}
      onPointerCancel={()=>{dragStart.current=null;setDragOffset(0);}}
      onLostPointerCapture={()=>{if(dragStart.current!==null){dragStart.current=null;setDragOffset(0);}}}
      // Only the height changes during a gesture: bottom:0 stays anchored.
      style={{height:sheetDragHeight,transitionDuration:dragOffset?'0ms':undefined}}
      className={`rdv-figma-home-sheet absolute bottom-0 inset-x-0 ${sheetExpanded?'z-[51]':'z-30'} overflow-hidden flex flex-col transition-[height] duration-300 ease-out rdv-home-sheet ${collapsed?'h-[64px]':sheetExpanded?'h-[82dvh]':dragOffset?'':'h-[228px]'}`}>
      <button type="button" aria-label={collapsed?'Expandir início':'Recolher para explorar o mapa'} onClick={()=>{if(swallowNextClick.current){swallowNextClick.current=false;return;}if(sheetExpanded)setSheetExpanded(false);else setCollapsed(c=>!c);}}
        data-panel-grip
        aria-expanded={!collapsed}
        style={{touchAction:'none'}}
        className="mx-auto w-full h-9 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none" >
        <span className="bg-slate-300 rounded-full w-11 h-1.5"/>
      </button>
      {!collapsed && <div data-panel-scroll className="rdv-figma-sheet-content flex-1 min-h-0 w-full max-w-xl mx-auto overflow-y-auto overscroll-contain px-5 sm:px-5 pb-8 space-y-5">
        {(gps.error || locationAccess.help) && <div role="alert" className="bg-amber-50 p-3 rounded-xl text-xs text-amber-900 space-y-2">
          <p>{gps.error}</p>
          {locationAccess.help && <p className="font-medium">{locationAccess.help}</p>}
          <button type="button" disabled={locationAccess.requesting}
            className="underline font-bold disabled:opacity-50" onClick={()=>void locationAccess.request()}>
            {locationAccess.requesting?'Solicitando GPS...':'Permitir localização'}
          </button>
        </div>}
        {error && <p role="alert" className="bg-rose-50 p-3 rounded-xl text-xs text-rose-700">{error}</p>}
        <section className="space-y-3">
          <div>
            <h2 className="text-[21px] font-bold tracking-[-.045em] text-slate-950">Bora dar um rolê?</h2>
            <p className="text-[14px] mt-1 text-slate-500">Saia de onde está. A gente cria a volta.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={()=>showSheet('km')} aria-label="Por distância — Escolher KM" className="rdv-figma-card">
              <span className="rdv-figma-card-icon"><Route size={19} strokeWidth={1.6}/><ChevronRight size={17} className="-rotate-45"/></span>
              <strong className="rdv-figma-card-title">Por km</strong><small className="rdv-figma-card-detail">Escolha a distância</small>
            </button>
            <button type="button" onClick={()=>showSheet('hours')} aria-label="Por tempo — Escolher horas" className="rdv-figma-card">
              <span className="rdv-figma-card-icon"><Clock3 size={20} strokeWidth={1.6}/><ChevronRight size={17} className="-rotate-45"/></span>
              <strong className="rdv-figma-card-title">Por horas</strong><small className="rdv-figma-card-detail">Escolha a duração</small>
            </button>
          </div>
          <button type="button" aria-label="Comboio" onClick={()=>setShowConvoyActions(true)}
            className="w-full text-left bg-white border border-blue-200 rounded-[18px] p-3.5 flex items-center gap-3 shadow-[0_2px_8px_rgba(15,23,42,.035)]">
            <span className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-700"><Users size={21} strokeWidth={1.9}/></span>
            <span className="flex-1"><strong className="text-[13px] block text-slate-900">Comboio</strong><small className="text-[11px] text-slate-500">Criar ou entrar em um comboio</small></span><ChevronRight size={17} className="text-slate-400"/>
          </button>
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
    {showConvoyActions && <ConvoyActionModal
      onClose={()=>setShowConvoyActions(false)}
      onCreate={()=>{setShowConvoyActions(false);setShowCreateConvoy(true);}}
      onJoin={()=>{setShowConvoyActions(false);props.onJoinConvoy();}}
    />}
    {showCreateConvoy && <CreateConvoyModal
      trips={props.trips} vehicle={props.currentVehicle} signedIn={props.signedIn}
      onClose={()=>setShowCreateConvoy(false)}
      onCreate={props.onCreateConvoy}
      onPlanRoute={()=>showSheet('destination')}
      onOpenProfile={props.onOpenProfile}
      onLogin={props.onLogin}
    />}
    {mapTarget?.coords && <DestinationExplorer key={destinationExploreKey(mapTarget)} target={mapTarget} vehicle={props.currentVehicle}
      gpsAvailable={Boolean(liveCoords)} getOrigin={gpsCoordinates} onStartTrip={props.onStartTrip}
      selectedRouteId={displayRoute?.selectedId}
      onMapRoute={(origin,options,selectedId)=>setDisplayRoute({origin,options,selectedId})}
      onClose={()=>{setMapTarget(null);setDisplayRoute(null);setCollapsed(false);}} />}
    {(sheet==='km'||sheet==='hours') && !preview && <CreateTouristCircuitScreen
      mode={sheet} km={km} hours={hours} travelMode={travelMode} coords={liveCoords}
      tripType={tripType} preference={preference} busy={busy}
      warning={warning} validation={validation} error={error}
      onClose={closeSheet} onModeChange={setSheet}
      onKmChange={setKm} onHoursChange={setHours} onStep={stepValue}
      onTripTypeChange={()=>setTripType(value=>value==='round_trip'?'one_way':'round_trip')}
      onPreferenceChange={setPreference}
      onTravelModeChange={setTravelMode}
      onSubmit={()=>void submitCircuit()}
    />}

    {preview && <TripPreviewScreen
      key={preview.id} trip={preview}
      vehicleType={props.currentVehicle?.type || 'motorcycle'}
      isSaved={props.trips.some(savedTrip=>savedTrip.id===preview.id)}
      tollNotice={tollNotice} error={error}
      onRegenerate={preview.id===circuitPreviewId?()=>void submitCircuit(true):undefined}
      regenerating={busy}
      onClose={()=>setPreview(null)}
      onSave={()=>props.onSaveTrip(preview)}
      onAdjust={()=>{
        if(props.currentVehicle){props.onViewTripDetails(preview);setPreview(null);}
        else{setPreview(null);setSheet(lastCircuitMode);}
      }}
      onStart={()=>{props.onStartTrip(preview);setPreview(null);}}
    />}
    {sheet==='destination' && <div role="presentation" className="fixed inset-0 z-[70] bg-slate-950/10 flex items-end"
      onMouseDown={event=>{if(event.target===event.currentTarget)closeSheet();}}>
      <section role="dialog" aria-modal="true" aria-label="Escolher origem e destino"
        className="rdv-figma-preview bg-white w-full max-w-xl mx-auto flex flex-col min-h-[56dvh] max-h-[75dvh] overflow-hidden">
        <header className="flex gap-3 items-center p-4 bg-white border-b border-slate-100">
          <button type="button" aria-label="Voltar" onClick={closeSheet}><X size={20}/></button>
          <h1 className="text-[18px] font-bold">Escolher destino</h1>
        </header>
        <div className="p-5 pt-1 space-y-4 overflow-y-auto">
          <h2 className="text-xl font-extrabold">Rolê com origem e destino</h2>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={useGps} onChange={e=>setUseGps(e.target.checked)}/> Sair da minha localização (GPS)</label>
          {!useGps && <LocationSearch label="Origem" value={origin} onChange={setOrigin} bias={liveCoords}/>}
          <LocationSearch label="Destino" value={dest} onChange={setDest} bias={liveCoords} placeholder="Cidade, endereço, parque ou restaurante"/>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          {!props.currentVehicle && <button type="button" className="text-xs font-bold underline text-blue-700" onClick={()=>{closeSheet();props.onOpenProfile();}}>Cadastrar meu veículo no Perfil</button>}
          <button type="button" onClick={()=>void submitDestination()} disabled={busy||!dest.coords||(!useGps&&!origin.coords)}
            className="w-full p-4 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50">{busy?'Calculando...':'Ver percurso'}</button>
        </div>
      </section>
    </div>}

  </div>;
}

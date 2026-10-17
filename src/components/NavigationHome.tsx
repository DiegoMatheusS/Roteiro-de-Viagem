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
import { prepareRoadPreview } from '../services/itinerary';
import { requestTolls, tollBudgetPatch } from '../services/routeConditions';
import { useEffect } from 'react';
import { InteractiveMap } from './InteractiveMap';
import { Speedometer } from './Speedometer';
import { RoadAlertReporter } from './RoadAlertReporter';
import { LocationSearch } from './LocationSearch';
import { fuelApi } from '../services/fuelApi';
import { DestinationExplorer } from './DestinationExplorer';
import { CreateConvoyModal } from './CreateConvoyModal';

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
  const [preview, setPreview] = useState<TripPlan|null>(null);
  const [showCreateConvoy, setShowCreateConvoy] = useState(false);
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
    if(delta>0){if(sheetExpanded)setSheetExpanded(false);else setCollapsed(true);}
    else{if(collapsed)setCollapsed(false);else setSheetExpanded(true);}
  };
  // O painel inteiro acompanha o dedo, exceto botões, inputs e a lista rolável.
  const startPanelDrag = (event:React.PointerEvent<HTMLDivElement>)=>{
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
      if(sheet || preview){(event as CustomEvent).preventDefault();closeSheet();return;}
      if(mapTarget){(event as CustomEvent).preventDefault();setMapTarget(null);setDisplayRoute(null);setCollapsed(false);return;}
      if(!collapsed){(event as CustomEvent).preventDefault();setCollapsed(true);}
    };
    window.addEventListener('rdv:close-overlay',close);
    return()=>window.removeEventListener('rdv:close-overlay',close);
  },[sheet,preview,mapTarget,collapsed,showCreateConvoy]);
  const [centerRequest,setCenterRequest] = useState(0);
  const centeredOnce=React.useRef(false);
  useEffect(()=>{if(liveCoords && !centeredOnce.current){centeredOnce.current=true;setCenterRequest(value=>value+1);}},[liveCoords?.[0],liveCoords?.[1]]);
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
    const amount = sheet === 'km' ? 10 : 0.5;
    const n = Math.max(sheet === 'km' ? 1 : 0.1,(parseTouristTarget(currentValue) || 0) + (increase ? amount : -amount));
    if(sheet === 'km')setKm(String(n));else setHours(String(n));
  };
  return <div className="relative bg-[#eaf0ef] h-[100dvh] overflow-hidden rdv-navigation-screen" aria-label="Início do Rolê">
    <div className="absolute inset-0 rdv-flat-map">
      <InteractiveMap roadStyle followUser={false} userLiveCoords={liveCoords} onSelectCoordinates={()=>{setCollapsed(true);setSheetExpanded(false);}}
        destinationCoords={mapTarget?.coords} destinationLabel={mapTarget?.name}
        focusedCoords={mapTarget?.coords} originCoords={displayRoute?.origin} routePath={displayRoute?.options.find(choice=>choice.id===displayRoute?.selectedId)?.routePath || []}
        routeAlternatives={displayRoute?.options || []} selectedRouteId={displayRoute?.selectedId}
        onSelectRoute={id=>setDisplayRoute(current=>current?{...current,selectedId:id}:current)}
        blueRoute centerOnUserRequest={centerRequest} showFuelStations className="w-full h-full" />
    </div>
    {/* Velocímetro, GPS e reporte alinhados horizontalmente e acompanhando o painel. */}
    <div aria-label="Controles de localização e ocorrência no início"
      className={`absolute right-4 z-40 flex flex-row items-center gap-3 transition-[bottom] duration-300 ${collapsed?'bottom-[99px]':sheetExpanded?'bottom-[calc(67dvh+25px)]':'bottom-[calc(max(37dvh,300px)+25px)]'}`}>
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
      className={`absolute left-4 z-40 transition-[bottom] duration-300 ${collapsed?'bottom-[86px]':sheetExpanded?'bottom-[calc(67dvh+12px)]':'bottom-[calc(max(37dvh,300px)+12px)]'}`} />
    <div data-testid="home-main-sheet"
      onPointerDown={startPanelDrag}
      onPointerMove={event=>{if(dragStart.current!==null)setDragOffset(Math.max(-180,Math.min(260,event.clientY-dragStart.current)));}}
      onPointerUp={finishPanelDrag}
      onPointerCancel={()=>{dragStart.current=null;setDragOffset(0);}}
      style={{transform:dragOffset?`translateY(${dragOffset}px)`:undefined,transitionDuration:dragOffset?'0ms':undefined}}
      className={`absolute bottom-0 inset-x-0 z-30 rounded-t-[28px] bg-white/95 backdrop-blur-xl shadow-[0_-14px_45px_rgba(15,23,42,.14)] border-t border-white/90 flex flex-col transition-[height,transform] duration-300 ease-out rdv-home-sheet ${collapsed?'h-[74px]':sheetExpanded?'h-[67dvh]':'h-[37dvh] min-h-[300px] max-h-[65dvh]'}`}>
      <button type="button" aria-label={collapsed?'Expandir início':'Recolher para explorar o mapa'} onClick={()=>{if(swallowNextClick.current){swallowNextClick.current=false;return;}if(sheetExpanded)setSheetExpanded(false);else setCollapsed(c=>!c);}}
        data-panel-grip
        aria-expanded={!collapsed}
        style={{touchAction:'none'}}
        className="mx-auto w-full h-9 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none" >
        <span className="bg-slate-300 rounded-full w-11 h-1.5"/>
      </button>
      {!collapsed && <div data-panel-scroll className="flex-1 w-full max-w-xl mx-auto overflow-y-auto px-4 sm:px-5 pb-8 space-y-5">
        <form role="search" aria-label="Busca rápida de destinos" onSubmit={event=>void submitQuickSearch(event)}
          className="rounded-[20px] w-full bg-[#f3f7fb] border border-slate-200/80 px-4 py-2 flex items-center gap-3 text-slate-600 text-sm min-h-[54px] shadow-[0_3px_12px_#2239550e] focus-within:border-blue-400 focus-within:ring-[3px] focus-within:ring-blue-100/80 transition-shadow">
          <Search size={21} strokeWidth={2} className="shrink-0 text-slate-600" aria-hidden="true"/>
          <input ref={searchInputRef} type="search" enterKeyHint="search" autoComplete="off" maxLength={150}
            aria-label="Para onde quer ir?" placeholder="Para onde quer ir?" value={searchPlace.name}
            onChange={event=>{searchGeneration.current++;setSearchBusy(false);setSearchError('');setSearchPlace({name:event.target.value});}}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium text-slate-900 placeholder:text-slate-600"/>
          <button type="submit" aria-label="Pesquisar destino" disabled={searchBusy || searchPlace.name.trim().length<3}
            className="w-9 h-9 rounded-xl text-blue-600 disabled:text-slate-400 flex items-center justify-center">
            {searchBusy?<span className="text-xs font-bold">...</span>:<ChevronRight size={20}/>}
          </button>
        </form>
        {searchError && <p role="alert" className="bg-rose-50 text-rose-700 rounded-xl px-3 py-2 text-xs">{searchError}</p>}
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
            <h2 className="text-[21px] font-bold tracking-[-.045em] text-slate-950">Dar um rolê por aí?</h2>
            <p className="text-[14px] mt-1 text-slate-500">Escolha como prefere passear.</p>
          </div>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
            <button type="button" onClick={()=>showSheet('km')}
              className="rdv-choice-card group bg-gradient-to-br from-[#eaf5ff] to-white border border-[#cfe4fb] rounded-[20px] p-3 min-h-[158px] flex flex-col items-start gap-2 text-left shadow-[0_5px_16px_#1a5aa90c]">
              <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center" aria-hidden="true">
                <Navigation size={21} strokeWidth={2.2}/>
              </span>
              <strong className="text-blue-800 text-[16px] font-semibold block tracking-tight">Por distância</strong>
              <span className="rdv-primary-action rdv-primary-action--blue mt-auto w-full">
                Escolher KM <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true"/>
              </span>
            </button>
            <button type="button" onClick={()=>showSheet('hours')}
              className="rdv-choice-card group bg-gradient-to-br from-[#eafaf3] to-white border border-[#bde7d5] rounded-[20px] p-3 min-h-[158px] flex flex-col items-start gap-2 text-left shadow-[0_5px_16px_#19765e0b]">
              <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center" aria-hidden="true">
                <Clock3 size={21} strokeWidth={2.2}/>
              </span>
              <strong className="text-emerald-800 text-[16px] font-semibold block tracking-tight">Por tempo</strong>
              <span className="rdv-primary-action rdv-primary-action--green mt-auto w-full">
                Escolher horas <ChevronRight size={17} strokeWidth={2.2} aria-hidden="true"/>
              </span>
            </button>
          </div>
          <button type="button" onClick={()=>setShowCreateConvoy(true)}
            className="w-full text-left bg-white border border-blue-200 rounded-[18px] p-3.5 flex items-center gap-3 shadow-[0_2px_8px_rgba(15,23,42,.035)]">
            <span className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 text-blue-700"><Users size={21} strokeWidth={1.9}/></span>
            <span className="flex-1"><strong className="text-[13px] block text-slate-900">Criar Comboio</strong><small className="text-[11px] text-slate-500">Organize um rolê e convide seus amigos</small></span><ChevronRight size={17} className="text-slate-400"/>
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
    {showCreateConvoy && <CreateConvoyModal
      trips={props.trips} vehicle={props.currentVehicle} signedIn={props.signedIn}
      onClose={()=>setShowCreateConvoy(false)}
      onCreate={props.onCreateConvoy}
      onPlanRoute={()=>showSheet('destination')}
      onOpenProfile={props.onOpenProfile}
      onLogin={props.onLogin}
      onJoinCode={props.onJoinConvoy}
    />}
    {mapTarget?.coords && <DestinationExplorer key={mapTarget.id || mapTarget.name} target={mapTarget} vehicle={props.currentVehicle}
      gpsAvailable={Boolean(liveCoords)} getOrigin={gpsCoordinates} onStartTrip={props.onStartTrip}
      selectedRouteId={displayRoute?.selectedId}
      onMapRoute={(origin,options,selectedId)=>setDisplayRoute({origin,options,selectedId})}
      onClose={()=>{setMapTarget(null);setDisplayRoute(null);setCollapsed(false);}} />}
    {(sheet!==null || preview!==null) && <div role="presentation" className="fixed inset-0 z-[70] bg-slate-950/55 flex items-end" onMouseDown={event=>{if(event.target===event.currentTarget)closeSheet();}}>
      <section role="dialog" aria-modal="true" aria-label={preview?'Visualizar viagem':sheet==='destination'?'Escolher origem e destino':'Criar um rolê'} className={`bg-white rounded-t-[30px] w-full max-w-xl mx-auto flex flex-col ${preview?'h-[88dvh]':'max-h-[90dvh]'} overflow-hidden shadow-2xl`}>
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

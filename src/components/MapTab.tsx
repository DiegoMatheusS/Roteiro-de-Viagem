import { RouteConditionsStatus,type ConditionsStatus } from './RouteConditionsStatus';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { DestinationExplorer } from './DestinationExplorer';
import { destinationExploreKey } from '../services/destinationIdentity';
import type { LocationSelection } from '../types/itinerary';
import type { VerifiedRouteChoice } from '../services/routeChoices';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useGpsPermissionAction } from '../hooks/useGpsPermissionAction';
import { getCurrentDeviceLocation } from '../services/locationService';
import { recentExplorationOrigin } from '../services/explorationOrigin';
import type { Vehicle, TripPlan, ConvoyParticipant, MeetingPoint } from '../types';
import { InteractiveMap, type MapVisiblePlace } from './InteractiveMap';
import { visiblePlacesSignature } from '../services/mapVisiblePlaces';
import { mapSheetHeight } from '../services/mapSheetSizing';
import { PLACE_KINDS, TOURIST_PLACE_KINDS } from '../types/admin';
import { useRoadAlerts } from '../hooks/useRoadAlerts';
import {useMapAppearance} from '../hooks/useMapAppearance';
import { RoadAlertReporter } from './RoadAlertReporter';
import { Speedometer } from './Speedometer';
import { ArrowLeft, CloudRain, Fuel, Mountain, Navigation, Play, PowerOff, Share2, Users, Search, ChevronRight, LocateFixed, MapPin, Compass, Store, Layers } from 'lucide-react';
interface MapTabProps {
  convoyParticipants?:ConvoyParticipant[];meetingPoints?:MeetingPoint[];
  conditions: ConditionsStatus; routeVehicleType?: 'car' | 'motorcycle'; sosOpen?: boolean;
  currentVehicle: Vehicle | null; activeTrip: TripPlan | null; plannedTrip: TripPlan | null; activeConvoyId?: string | null;
  onBackToMenu: () => void; onEndTrip: (trip: TripPlan) => void; onContinueTrip: () => void;
  onOpenRoutePlanner: (origin: string, dest: string, coords?: [number, number], originCoords?: [number, number]) => void;
  onNavigateHome: () => void; onOpenSos: () => void; onStartTrip?: (trip: TripPlan) => void;
  onOpenShareModal?: (trip: TripPlan) => void; onOpenConvoyModal?: (trip: TripPlan) => void; onEndConvoy?: () => void;
}
export function MapTab(props: MapTabProps) {
  const trip = props.activeTrip || props.plannedTrip;
  const roadAlerts = useRoadAlerts(trip?.routePath || []);

  const [showRain, setShowRain] = useState(false), [showStops, setShowStops] = useState(true), [showFuel, setShowFuel] = useState(true), [confirmEnd, setConfirmEnd] = useState(false);
  const [layerMenuOpen,setLayerMenuOpen] = useState(false);
  const location = useDeviceLocation(!props.sosOpen, 'map-destination-search');
  const locationAccess = useGpsPermissionAction(location.retry);
  const [searchDestination, setSearchDestination] = useState<LocationSelection>({ name: '' });
  const [searchBusy,setSearchBusy] = useState(false);
  const [searchError,setSearchError] = useState('');
  const searchGeneration=useRef(0);
  const searchInputRef=useRef<HTMLInputElement>(null);
  const [mapTarget,setMapTarget] = useState<LocationSelection|null>(null);
  const [exploreRoute,setExploreRoute] = useState<{origin:[number,number];options:VerifiedRouteChoice[];selectedId:string}|null>(null);
  const [sheetExpanded,setSheetExpanded] = useState(false);
  const [visiblePlaces,setVisiblePlaces] = useState<MapVisiblePlace[]>([]);
  const [focusedCoords,setFocusedCoords] = useState<[number,number] | null>(null);
  const [centerRequest,setCenterRequest] = useState(0);
  const [locationHint,setLocationHint] = useState('');
  const centeredAutomatically = useRef(false);
  const touchStart = useRef<number|null>(null);
  const swipeConsumed = useRef(false);
  const [dragOffset,setDragOffset] = useState(0);
  const touristKinds = TOURIST_PLACE_KINDS as readonly string[];
  const suggestions = useMemo(() => visiblePlaces.filter(p => touristKinds.includes(p.kind)).slice(0,5),[visiblePlaces]);
  const establishments = useMemo(() => visiblePlaces.filter(p => !p.id.startsWith('stop:')).slice(0,15),[visiblePlaces]);
  const updateVisible = useCallback((next:MapVisiblePlace[]) => {
    setVisiblePlaces(previous => {
      const oldKey=visiblePlacesSignature(previous),newKey=visiblePlacesSignature(next);
      return oldKey===newKey ? previous : next;
    });
  },[]);
  useEffect(() => {
    if (location.status !== 'ready' || !location.position || centeredAutomatically.current || trip?.routePath?.length) return;
    centeredAutomatically.current = true;
    setCenterRequest(value=>value+1);
  },[location.status, location.position?.coords?.[0], location.position?.coords?.[1],trip?.id]);
  const locateUser = () => {
    if (location.status === 'ready' && location.position) {
      setLocationHint('');
      setFocusedCoords(null);
      setCenterRequest(value=>value+1);
    } else {
      setLocationHint('');
      void locationAccess.request().then(granted => {
        if (granted) {
          setFocusedCoords(null);
          setCenterRequest(value => value + 1);
        }
      });
    }
  };
  const showPlace = (place:MapVisiblePlace) => {
    setFocusedCoords([place.coords[0],place.coords[1]]);
    setSheetExpanded(false);
  };
  const focusDestination = (target:LocationSelection) => {
    setSearchDestination(target);
    if(!target.coords)return;
    searchInputRef.current?.blur();
    setMapTarget(target);setExploreRoute(null);setFocusedCoords(target.coords);
    setSheetExpanded(false);setSearchError('');
  };
  const submitQuickSearch = async (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query=searchDestination.name.trim();
    if(query.length<3){setSearchError('Digite pelo menos 3 caracteres do destino.');return;}
    if(searchBusy)return;
    const generation=++searchGeneration.current;
    setSearchBusy(true);setSearchError('');
    try {
      const bias=location.status==='ready' ? location.position?.coords : undefined;
      const result=await fuelApi<{results:LocationSelection[];unavailable?:boolean}>(`/locations/search?q=${encodeURIComponent(query)}${bias?`&lat=${bias[0]}&lng=${bias[1]}`:''}`);
      if(generation!==searchGeneration.current)return;
      const found=result.results.find(place=>place.coords && place.coords.length===2 && place.coords.every(Number.isFinite));
      if(!found)throw new Error('Nenhum destino encontrado. Informe também a cidade ou um endereço mais completo.');
      focusDestination(found);
    }catch(err){if(generation===searchGeneration.current)setSearchError((err as Error).message);}
    finally{if(generation===searchGeneration.current)setSearchBusy(false);}
  };
  const selectSuggestion = (place:MapVisiblePlace) =>
    focusDestination({name:place.name,coords:place.coords,address:place.address});
  const toggleSheet=()=>setSheetExpanded(value=>!value);
  const handleGrabEnd = (event:React.PointerEvent<HTMLButtonElement>) => {
    if(touchStart.current===null)return;
    const delta=event.clientY-touchStart.current;
    touchStart.current=null;
    setDragOffset(0);
    if(Math.abs(delta)>32) {
      swipeConsumed.current=true;
      // Only swallow the synthetic click following this swipe, not a future tap.
      window.setTimeout(()=>{swipeConsumed.current=false;},0);
      setSheetExpanded(delta<0);
    }
  };
  const getExplorationOrigin = async (): Promise<[number,number]> => {
    // O rastreador da tela Mapa já tem uma posição recente. Reutilizá-la evita
    // uma segunda solicitação de GPS e o timeout que bloqueava o cálculo.
    const tracked=recentExplorationOrigin(location.status==='ready' ? location.position : null);
    if(tracked)return tracked;
    const gps=await getCurrentDeviceLocation();
    if(gps.accuracyMeters>150)throw new Error('GPS impreciso. Tente novamente em um lugar aberto.');
    return gps.coords;
  };
  return <div className="relative w-full h-[100dvh] min-h-[420px] overflow-hidden bg-slate-50 rdv-flat-map" data-role-theme={appearanceTheme}>
    <InteractiveMap convoyParticipants={props.convoyParticipants} meetingPoints={props.meetingPoints} originCoords={mapTarget ? exploreRoute?.origin : trip?.originCoords} destinationCoords={mapTarget ? mapTarget.coords : trip?.destinationCoords} originLabel={trip?.originName} destinationLabel={mapTarget?.name || trip?.destinationName} routePath={mapTarget ? exploreRoute?.options.find(option=>option.id===exploreRoute?.selectedId)?.routePath || [] : trip?.routePath || []}
      routeAlternatives={mapTarget ? exploreRoute?.options || [] : []}
      onSelectCoordinates={()=>setSheetExpanded(false)}
      selectedRouteId={exploreRoute?.selectedId}
      onSelectRoute={id=>setExploreRoute(current=>current?{...current,selectedId:id}:current)} routeModality={trip?.modality} roadStyle blueRoute={!props.activeTrip}
      userLiveCoords={location.status === "ready" ? location.position?.coords : undefined}
      userGpsAccuracyMeters={location.status === 'ready'?location.position?.accuracyMeters:undefined}
       userHeadingDegrees={location.status === "ready" ? location.position?.headingDegrees : null}
       userSpeedMetersPerSecond={location.status === "ready" ? location.position?.speedMetersPerSecond : null}
      centerOnUserRequest={centerRequest} focusedCoords={focusedCoords}
      onVisiblePlacesChange={updateVisible} stops={showStops ? trip?.stops || [] : []} weatherPoints={trip?.weatherPoints || []} roadAlerts={roadAlerts.alerts} onRoadAlertUpdated={()=>{void roadAlerts.reload();}} tolls={trip?.tolls || []} tollVehicleType={props.routeVehicleType} showRainLayer={showRain} showFuelStations={showFuel} className="w-full h-full" />
    {!mapTarget && <div className="absolute top-20 left-3 right-16 z-30 max-w-sm bg-white rounded-2xl shadow-xl border p-3 space-y-3">
      <div className="flex gap-3 items-start"><button onClick={props.onBackToMenu} aria-label="Voltar ao menu" className="p-2 rounded-xl bg-emerald-50 text-emerald-800 shrink-0"><ArrowLeft size={20} /></button><div className="min-w-0"><p className="text-[10px] uppercase font-bold text-slate-500">{props.activeTrip ? 'Em andamento' : trip ? 'Viagem programada' : 'Seu mapa'}</p><h3 className="font-bold text-sm truncate">{trip?.destinationName || 'Planeje sua primeira viagem'}</h3><p className="text-xs text-slate-500">{trip ? `${trip.distanceKm.toFixed(1)} km · ${Math.round(trip.durationMinutes)} min` : 'Escolha origem e destino no Início.'}</p></div></div>
      {trip && <><div className="grid grid-cols-3 gap-2 text-[10px] font-bold"><button onClick={() => props.onOpenShareModal?.(trip)} className="p-2 border rounded-xl flex items-center justify-center gap-1"><Share2 size={13} />Compartilhar</button><button onClick={() => props.onOpenConvoyModal?.(trip)} className="p-2 border rounded-xl flex items-center justify-center gap-1 text-violet-700"><Users size={13} />Comboio</button><button onClick={() => props.activeTrip ? props.onContinueTrip() : props.onStartTrip?.(trip)} className="p-2 bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-1"><Play size={13} />{props.activeTrip ? 'Navegar' : 'Iniciar'}</button></div><button onClick={() => setConfirmEnd(true)} className="w-full p-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-2"><PowerOff size={14} />Encerrar viagem</button></>}
    </div>
    }
    {/* Ações secundárias agrupadas: GPS e reportar permanecem sempre visíveis. */}
    <div className="absolute top-3 right-3 z-30 flex flex-col items-end gap-2">
      <button type="button" onClick={props.onOpenSos}
        className="h-10 w-12 rounded-xl bg-rose-700 text-white text-xs font-black shadow-lg">SOS</button>
      <button type="button" aria-label="Camadas do mapa" aria-expanded={layerMenuOpen}
        onClick={()=>setLayerMenuOpen(v=>!v)}
        className="w-12 h-11 rounded-xl bg-white text-slate-700 border border-slate-200 shadow-lg flex items-center justify-center">
        <Layers size={20}/>
      </button>
      {layerMenuOpen && <div role="group" aria-label="Configurações das camadas do mapa"
        className="absolute top-[102px] right-0 w-[177px] bg-white border border-slate-100 rounded-2xl p-2 shadow-xl space-y-1 text-xs">
        <button type="button" onClick={()=>setShowRain(v=>!v)} aria-label="Mostrar previsão de chuva" aria-pressed={showRain}
          className="w-full p-2.5 flex items-center gap-2 text-left rounded-xl hover:bg-slate-50">
          <CloudRain size={17} className={showRain?'text-blue-600':'text-slate-500'}/> Previsão de chuva</button>
        <button type="button" onClick={()=>setShowStops(v=>!v)} aria-label="Mostrar paradas" aria-pressed={showStops}
          className="w-full p-2.5 flex items-center gap-2 text-left rounded-xl hover:bg-slate-50">
          <Mountain size={17} className={showStops?'text-emerald-600':'text-slate-500'}/> Paradas</button>
        <button type="button" onClick={()=>setShowFuel(v=>!v)} aria-label="Mostrar postos" aria-pressed={showFuel}
          className="w-full p-2.5 flex items-center gap-2 text-left rounded-xl hover:bg-slate-50">
          <Fuel size={17} className={showFuel?'text-blue-600':'text-slate-500'}/> Postos</button>
      </div>}
    </div>
    {/* GPS em cima e triângulo de ocorrência embaixo, junto à lateral direita. */}
    <div aria-label="Controles de localização e ocorrência"
      className={`absolute right-4 z-40 flex flex-col items-center gap-3 transition-[top,bottom] duration-300 ${sheetExpanded ? 'top-[clamp(64px,10dvh,118px)]' : 'bottom-[140px]'}`}>
      <button type="button" aria-label="Centralizar mapa na minha localização" onClick={locateUser}
        className="w-12 h-12 rounded-full bg-white text-blue-700 border border-slate-200 shadow-[0_4px_18px_rgba(15,23,42,.16)] flex items-center justify-center active:scale-95">
        <LocateFixed size={24} strokeWidth={2.2}/>
      </button>
      <RoadAlertReporter location={location.status==='ready' ? location.position : null}
        speedKmH={location.status==='ready' && location.position?.speedMetersPerSecond!=null
          ? location.position.speedMetersPerSecond*3.6 : null}
        menuPlacement={sheetExpanded ? 'below' : 'above'}
        onSubmitted={()=>{void roadAlerts.reload();}}/>
    </div>
    <Speedometer position={location.status === 'ready' ? location.position : null}
      className={`absolute left-3 z-40 transition-[top,bottom] duration-300 ${sheetExpanded?'top-[clamp(110px,16dvh,160px)]':'bottom-[140px]'}`} />
    {(locationHint || locationAccess.help || locationAccess.requesting) && <div role="status" className="absolute top-64 right-3 z-30 bg-amber-50 border border-amber-100 max-w-[245px] rounded-xl shadow p-3 text-xs text-amber-900 space-y-2">
      <p>{locationAccess.requesting?'Solicitando acesso ao GPS...':locationAccess.help || locationHint}</p>
      {!locationAccess.requesting && <button type="button" onClick={()=>void locationAccess.request()} className="font-bold underline">Tentar GPS</button>}
    </div>}
    {trip && !sheetExpanded && <div className="absolute bottom-[172px] left-[104px] right-3 max-w-[260px] z-30"><RouteConditionsStatus trip={trip} conditions={props.conditions} /></div>}
    {trip && <button onClick={() => props.onOpenRoutePlanner(trip.originName, trip.destinationName, trip.destinationCoords, trip.originCoords)} className="absolute bottom-28 left-3 z-30 px-4 py-3 bg-white border rounded-xl shadow-xl text-xs font-bold flex gap-2"><Navigation size={16} />Alterar rota</button>}

    {/* Painel da tela Mapa: puxador por gesto ou clique, conteúdos conectados à região visível. */}
    <section aria-label="Explorar destinos e estabelecimentos" data-testid="map-explore-sheet"
      style={{height:mapSheetHeight(sheetExpanded,Boolean(searchError),dragOffset),
        transitionDuration:dragOffset?'0ms':undefined}}
      className="absolute bottom-0 inset-x-0 z-30 overflow-hidden bg-white/95 backdrop-blur-xl rounded-t-[28px] shadow-[0_-14px_40px_#0f172a20] flex flex-col transition-[height] duration-300 ease-out rdv-home-sheet">
      <button type="button" aria-label={sheetExpanded ? 'Recolher painel do mapa' : 'Expandir painel do mapa'}
        aria-expanded={sheetExpanded}
        className="w-full h-8 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        style={{touchAction:'none'}}
        onPointerDown={event => {
          if(!event.isPrimary)return;
          touchStart.current=event.clientY;
          swipeConsumed.current=false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event=>{
          if(touchStart.current!==null)setDragOffset(Math.max(-260,Math.min(180,event.clientY-touchStart.current)));
        }}
        onPointerUp={handleGrabEnd}
        onPointerCancel={()=>{touchStart.current=null;setDragOffset(0);}}
        onLostPointerCapture={()=>{if(touchStart.current!==null){touchStart.current=null;setDragOffset(0);}}}
        onClick={()=>{
          if(swipeConsumed.current){swipeConsumed.current=false;return;}
          toggleSheet();
        }}>
        <span className="w-11 h-1.5 rounded-full bg-slate-300" aria-hidden="true" />
      </button>
      <div data-map-panel-scroll className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-5">
          <form role="search" aria-label="Busca rápida de destinos no mapa"
            onSubmit={event=>void submitQuickSearch(event)}
            className="flex items-center gap-3 bg-slate-100 rounded-2xl h-14 px-4 border border-slate-100 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
            <Search size={21} className="text-slate-600 shrink-0" aria-hidden="true"/>
            <input ref={searchInputRef} type="search" enterKeyHint="search" autoComplete="off"
              aria-label="Para onde quer ir?" placeholder="Para onde quer ir?" maxLength={150}
              value={searchDestination.name}
              onChange={event=>{searchGeneration.current++;setSearchBusy(false);setSearchError('');setSearchDestination({name:event.target.value});}}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-500"/>
            <button type="submit" aria-label="Pesquisar destino" disabled={searchBusy || searchDestination.name.trim().length<3}
              className="w-9 h-9 rounded-xl text-blue-600 disabled:text-slate-400 flex items-center justify-center">
              {searchBusy?<span className="text-xs font-bold">...</span>:<ChevronRight size={20}/>}</button>
          </form>
          {searchError && <p role="alert" className="rounded-xl bg-rose-50 text-rose-700 px-3 py-2 text-xs">{searchError}</p>}
          {sheetExpanded && <div className="space-y-6 pb-4">
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold tracking-tight text-[17px] text-slate-900">Viagens sugeridas</h2>
                <span className="text-[11px] text-slate-500">Perto do mapa</span>
              </div>
              {suggestions.length===0 && <p className="bg-slate-50 rounded-xl text-xs text-slate-500 p-3">Nenhum ponto turístico cadastrado nesta área. Explore ou aproxime o mapa para descobrir destinos.</p>}
              {suggestions.map(place=><button type="button" key={place.id} onClick={()=>selectSuggestion(place)}
                className="flex items-center text-left w-full gap-3 border border-slate-100 rounded-2xl px-3 py-3 min-h-[64px] bg-white shadow-sm">
                <span className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700"><Compass size={22}/></span>
                <span className="min-w-0 flex-1"><strong className="text-sm text-slate-900 block truncate">{place.name}</strong>
                  <small className="text-[11px] text-slate-500 block truncate">{place.address||'Ponto turístico cadastrado'}</small></span>
                <ChevronRight size={17} className="text-slate-400"/>
              </button>)}
            </section>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold tracking-tight text-[17px] text-slate-900">Estabelecimentos no mapa</h2>
                <span className="text-[11px] text-slate-500">{establishments.length} visíveis</span>
              </div>
              {establishments.length===0 && <p className="bg-slate-50 rounded-xl text-xs text-slate-500 p-3">Nenhum estabelecimento cadastrado nesta parte do mapa. Amplie ou mova o mapa para outra região.</p>}
              {establishments.map(place=>{
                const category=PLACE_KINDS.find(kind=>kind.id===place.kind)?.label || (place.kind==='fuel' ? 'Posto de combustível' : 'Estabelecimento');
                return <button type="button" key={place.id} onClick={()=>showPlace(place)}
                  className="flex items-center text-left w-full gap-3 border border-slate-100 rounded-2xl px-3 py-3 min-h-[64px] bg-white shadow-sm">
                  <span className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-blue-50 text-blue-700">{place.kind==='fuel'?<Fuel size={21}/>:<Store size={21}/>}</span>
                  <span className="min-w-0 flex-1"><strong className="text-sm text-slate-900 block truncate">{place.name}</strong>
                    <small className="text-[11px] text-slate-500 block truncate">{category}{place.address ? ' · '+place.address : ''}</small></span>
                  <MapPin size={17} className="text-blue-600"/>
                </button>;
              })}
            </section>
          </div>}
        </div>
      </div>
    </section>
    {mapTarget?.coords && <DestinationExplorer key={destinationExploreKey(mapTarget)} target={mapTarget}
      vehicle={props.currentVehicle} gpsAvailable={location.status==='ready'} getOrigin={getExplorationOrigin}
      onStartTrip={trip=>props.onStartTrip?.(trip)}
      selectedRouteId={exploreRoute?.selectedId}
      onMapRoute={(origin,options,selectedId)=>{setExploreRoute({origin,options,selectedId});setFocusedCoords(null);}}
      onClose={()=>{setMapTarget(null);setExploreRoute(null);setFocusedCoords(null);}} />}
    {showRain && <p className="absolute top-60 left-3 z-30 bg-white rounded-xl p-2 text-[10px] max-w-[220px] shadow">{trip?.weatherPoints.length ? 'Previsão nos pontos do percurso · Open-Meteo. Não é radar ao vivo.' : 'Previsão indisponível. Atualize no planejamento.'}</p>}
    {confirmEnd && trip && <div role="dialog" aria-modal="true" aria-label="Encerrar viagem programada" className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"><div className="bg-white p-5 rounded-2xl max-w-sm space-y-4"><h3 className="font-bold">Encerrar esta viagem?</h3><p className="text-sm text-slate-600">{props.activeTrip ? 'A navegação será interrompida.' : 'O roteiro deixará de estar programado.'} Você poderá consultar a viagem encerrada no histórico.</p><div className="flex gap-2"><button onClick={() => setConfirmEnd(false)} className="p-3 border rounded-xl">Manter viagem</button><button onClick={() => { props.onEndTrip(trip); setConfirmEnd(false); }} className="p-3 bg-rose-700 text-white rounded-xl">Sim, encerrar</button></div></div></div>}
  </div>;
}

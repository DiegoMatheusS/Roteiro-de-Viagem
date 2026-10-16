import { RouteConditionsStatus,type ConditionsStatus } from './RouteConditionsStatus';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TripCostSummary } from './TripCostSummary';
import { vehicleFuelKind } from '../services/tripBudget';
import { LocationSearch } from './LocationSearch';
import type { LocationSelection } from '../types/itinerary';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { getCurrentDeviceLocation } from '../services/locationService';
import type { Vehicle, TripPlan, ConvoyParticipant, MeetingPoint } from '../types';
import { InteractiveMap, type MapVisiblePlace } from './InteractiveMap';
import { PLACE_KINDS, TOURIST_PLACE_KINDS } from '../types/admin';
import { useRoadAlerts } from '../hooks/useRoadAlerts';
import { ArrowLeft, CloudRain, Fuel, Mountain, Navigation, Play, PowerOff, Share2, Users, Search, X, ChevronRight, LocateFixed, MapPin, Compass, Store, ChevronUp } from 'lucide-react';
interface MapTabProps {
  convoyParticipants?:ConvoyParticipant[];meetingPoints?:MeetingPoint[];
  travelledDistanceKm?: number;
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
  const location = useDeviceLocation(!props.sosOpen, 'map-destination-search');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDestination, setSearchDestination] = useState<LocationSelection>({ name: '' });
  const [searchOrigin, setSearchOrigin] = useState<LocationSelection>({ name: '' });
  const [useGpsOrigin, setUseGpsOrigin] = useState(true);
  const [searchError, setSearchError] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [sheetExpanded,setSheetExpanded] = useState(false);
  const [visiblePlaces,setVisiblePlaces] = useState<MapVisiblePlace[]>([]);
  const [focusedCoords,setFocusedCoords] = useState<[number,number] | null>(null);
  const [centerRequest,setCenterRequest] = useState(0);
  const [locationHint,setLocationHint] = useState('');
  const centeredAutomatically = useRef(false);
  const touchStart = useRef<number|null>(null);
  const swipeConsumed = useRef(false);
  const touristKinds = TOURIST_PLACE_KINDS as readonly string[];
  const suggestions = useMemo(() => visiblePlaces.filter(p => touristKinds.includes(p.kind)).slice(0,5),[visiblePlaces]);
  const establishments = useMemo(() => visiblePlaces.filter(p => !p.id.startsWith('stop:')).slice(0,15),[visiblePlaces]);
  const updateVisible = useCallback((next:MapVisiblePlace[]) => {
    setVisiblePlaces(previous => {
      const oldKey=JSON.stringify(previous),newKey=JSON.stringify(next);
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
      setLocationHint(location.error || 'Ative a localização para centralizar o mapa.');
      location.retry();
    }
  };
  const showPlace = (place:MapVisiblePlace) => {
    setFocusedCoords([place.coords[0],place.coords[1]]);
    setSheetExpanded(false);
  };
  const selectSuggestion = (place:MapVisiblePlace) => {
    if (location.status === 'ready' && location.position && location.position.accuracyMeters <= 150) {
      props.onOpenRoutePlanner('Sua localização atual',place.name,place.coords,location.position.coords);
    } else {
      setSearchDestination({name:place.name,coords:place.coords});
      setUseGpsOrigin(false);
      setSearchOpen(true);
    }
  };
  const toggleSheet=()=>setSheetExpanded(value=>!value);
  const handleGrabEnd = (event:React.PointerEvent<HTMLButtonElement>) => {
    if(touchStart.current===null)return;
    const delta=event.clientY-touchStart.current;
    touchStart.current=null;
    if(Math.abs(delta)>32) {
      swipeConsumed.current=true;
      setSheetExpanded(delta<0);
    }
  };
  const startPlanner = async () => {
    if (!searchDestination.coords || searchBusy || (!useGpsOrigin && !searchOrigin.coords)) return;
    setSearchBusy(true); setSearchError('');
    try {
      const gps = useGpsOrigin ? await getCurrentDeviceLocation() : null;
      if (gps && gps.accuracyMeters > 150) throw new Error('Localização imprecisa. Use uma origem manual ou tente novamente.');
      const originCoords = gps?.coords || searchOrigin.coords!;
      setSearchOpen(false);
      props.onOpenRoutePlanner(gps ? 'Sua localização atual' : searchOrigin.name, searchDestination.name, searchDestination.coords, originCoords);
    } catch (error) {
      setSearchError((error as Error).message);
    } finally { setSearchBusy(false); }
  };
  return <div className="relative w-full h-[100dvh] min-h-[420px] overflow-hidden bg-slate-50 rdv-flat-map">
    <InteractiveMap convoyParticipants={props.convoyParticipants} meetingPoints={props.meetingPoints} originCoords={trip?.originCoords} destinationCoords={trip?.destinationCoords} originLabel={trip?.originName} destinationLabel={trip?.destinationName} routePath={trip?.routePath || []} routeModality={trip?.modality} roadStyle blueRoute fuelKind={vehicleFuelKind(props.currentVehicle)} travelledDistanceKm={props.activeTrip ? props.travelledDistanceKm || trip?.trackedDistanceKm || 0 : 0} totalRouteKm={trip?.distanceKm || 0}
      userLiveCoords={location.status === "ready" ? location.position?.coords : undefined}
      centerOnUserRequest={centerRequest} focusedCoords={focusedCoords}
      onVisiblePlacesChange={updateVisible} stops={showStops ? trip?.stops || [] : []} weatherPoints={trip?.weatherPoints || []} roadAlerts={roadAlerts.alerts} tolls={trip?.tolls || []} tollVehicleType={props.routeVehicleType} showRainLayer={showRain} showFuelStations={showFuel} className="w-full h-full" />
    <div className="absolute top-20 left-3 right-16 z-30 max-w-sm bg-white rounded-2xl shadow-xl border p-3 space-y-3">
      <div className="flex gap-3 items-start"><button onClick={props.onBackToMenu} aria-label="Voltar ao menu" className="p-2 rounded-xl bg-emerald-50 text-emerald-800 shrink-0"><ArrowLeft size={20} /></button><div className="min-w-0"><p className="text-[10px] uppercase font-bold text-slate-500">{props.activeTrip ? 'Em andamento' : trip ? 'Viagem programada' : 'Seu mapa'}</p><h3 className="font-bold text-sm truncate">{trip?.destinationName || 'Planeje sua primeira viagem'}</h3><p className="text-xs text-slate-500">{trip ? `${trip.distanceKm.toFixed(1)} km · ${Math.round(trip.durationMinutes)} min` : 'Escolha origem e destino no Início.'}</p></div></div>
      {trip && <><TripCostSummary trip={trip} /><div className="grid grid-cols-3 gap-2 text-[10px] font-bold"><button onClick={() => props.onOpenShareModal?.(trip)} className="p-2 border rounded-xl flex items-center justify-center gap-1"><Share2 size={13} />Compartilhar</button><button onClick={() => props.onOpenConvoyModal?.(trip)} className="p-2 border rounded-xl flex items-center justify-center gap-1 text-violet-700"><Users size={13} />Comboio</button><button onClick={() => props.activeTrip ? props.onContinueTrip() : props.onStartTrip?.(trip)} className="p-2 bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-1"><Play size={13} />{props.activeTrip ? 'Navegar' : 'Iniciar'}</button></div><button onClick={() => setConfirmEnd(true)} className="w-full p-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-2"><PowerOff size={14} />Encerrar viagem</button></>}
    </div>
    <div className="absolute top-3 right-3 z-30 flex flex-col gap-2"><button onClick={props.onOpenSos} className="h-10 w-11 rounded-xl bg-rose-700 text-white text-xs font-black shadow-lg">SOS</button><button onClick={() => setShowRain(!showRain)} aria-label="Mostrar previsão de chuva" className={`p-3 rounded-xl shadow-lg ${showRain ? 'bg-blue-700 text-white' : 'bg-white'}`}><CloudRain size={18} /></button><button onClick={() => setShowStops(!showStops)} aria-label="Mostrar paradas" className={`p-3 rounded-xl shadow-lg ${showStops ? 'bg-emerald-700 text-white' : 'bg-white'}`}><Mountain size={18} /></button><button onClick={() => setShowFuel(!showFuel)} aria-label="Mostrar postos" className={`p-3 rounded-xl shadow-lg ${showFuel ? 'bg-amber-600 text-white' : 'bg-white'}`}><Fuel size={18} /></button>
      <button type="button" aria-label="Centralizar mapa na minha localização" onClick={locateUser}
        className="w-11 h-11 rounded-full bg-white text-blue-700 border border-slate-100 shadow-lg flex items-center justify-center">
        <LocateFixed size={22} strokeWidth={2.2}/>
      </button>
    </div>
    {locationHint && <p role="status" className="absolute top-64 right-3 z-30 bg-amber-50 border border-amber-100 max-w-[210px] rounded-xl shadow p-3 text-xs text-amber-900">{locationHint}</p>}
    {trip && <div className="absolute bottom-44 left-3 right-16 max-w-[250px] z-30"><RouteConditionsStatus trip={trip} conditions={props.conditions} /></div>}
    {trip && <button onClick={() => props.onOpenRoutePlanner(trip.originName, trip.destinationName, trip.destinationCoords, trip.originCoords)} className="absolute bottom-28 left-3 z-30 px-4 py-3 bg-white border rounded-xl shadow-xl text-xs font-bold flex gap-2"><Navigation size={16} />Alterar rota</button>}

    {/* Painel da tela Mapa: puxador por gesto ou clique, conteúdos conectados à região visível. */}
    <section aria-label="Explorar destinos e estabelecimentos" data-testid="map-explore-sheet"
      className={`absolute bottom-0 inset-x-0 z-30 bg-white rounded-t-[28px] shadow-[0_-6px_30px_rgba(15,23,42,.12)] flex flex-col transition-[height] duration-300 ease-out ${sheetExpanded ? 'h-[76dvh]' : 'h-[116px]'}`}>
      <button type="button" aria-label={sheetExpanded ? 'Recolher painel do mapa' : 'Expandir painel do mapa'}
        aria-expanded={sheetExpanded}
        className="w-full h-8 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        style={{touchAction:'none'}}
        onPointerDown={event => {
          touchStart.current=event.clientY;
          swipeConsumed.current=false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={handleGrabEnd}
        onPointerCancel={()=>{touchStart.current=null;}}
        onClick={()=>{
          if(swipeConsumed.current){swipeConsumed.current=false;return;}
          toggleSheet();
        }}>
        <span className="w-11 h-1.5 rounded-full bg-slate-300" aria-hidden="true" />
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-5">
          <div className="flex items-center gap-3 bg-slate-100 rounded-2xl h-14 px-4 border border-slate-100 focus-within:border-blue-300">
            <Search size={21} className="text-slate-600 shrink-0" />
            <input type="search" aria-label="Para onde quer ir?" placeholder="Para onde quer ir?"
              value={searchDestination.name}
              onChange={event => {setSearchDestination({name:event.target.value});setSearchOpen(true);}}
              onFocus={() => setSearchOpen(true)}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-500" />
            <button type="button" aria-label="Abrir busca de destino"
              className="w-9 h-9 rounded-xl text-blue-600 flex items-center justify-center"
              onClick={() => setSearchOpen(true)}><ChevronRight size={20}/></button>
          </div>
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
    {searchOpen && <div className="fixed inset-0 z-[85] bg-slate-950/50 flex flex-col justify-end"
      role="presentation" onMouseDown={event => {if(event.target === event.currentTarget && !searchBusy)setSearchOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-label="Buscar destino no mapa"
        className="bg-white rounded-t-[30px] max-w-xl mx-auto w-full pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl max-h-[87dvh] overflow-y-auto">
        <div className="flex justify-between items-center px-5 pt-4 pb-2">
          <h2 className="text-xl font-extrabold text-slate-900">Para onde vamos?</h2>
          <button type="button" aria-label="Fechar busca do mapa" onClick={() => setSearchOpen(false)}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><X size={19}/></button>
        </div>
        <div className="px-5 space-y-4">
          <label className="flex items-center gap-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={useGpsOrigin} onChange={event => setUseGpsOrigin(event.target.checked)}
              className="accent-blue-600" /> Sair da minha localização (GPS)
          </label>
          {!useGpsOrigin && <LocationSearch label="Origem" value={searchOrigin} onChange={setSearchOrigin}
            bias={location.position?.coords} />}
          <LocationSearch label="Destino" value={searchDestination} onChange={setSearchDestination}
            placeholder="Cidade, rua, parque ou endereço" bias={location.position?.coords}/>
          {location.error && useGpsOrigin && <p role="status" className="bg-amber-50 text-amber-900 p-3 text-xs rounded-xl">
            {location.error} Você também pode desmarcar GPS e pesquisar uma origem manual.
          </p>}
          {searchError && <p role="alert" className="text-xs text-rose-700">{searchError}</p>}
          <button type="button" disabled={!searchDestination.coords || (!useGpsOrigin && !searchOrigin.coords) || searchBusy}
            onClick={() => void startPlanner()}
            className="w-full bg-blue-600 text-white rounded-2xl min-h-12 font-bold text-sm disabled:opacity-50">
            {searchBusy ? 'Localizando e preparando...' : 'Ver percurso no mapa'}
          </button>
        </div>
      </section>
    </div>}
    {showRain && <p className="absolute top-60 left-3 z-30 bg-white rounded-xl p-2 text-[10px] max-w-[220px] shadow">{trip?.weatherPoints.length ? 'Previsão nos pontos do percurso · Open-Meteo. Não é radar ao vivo.' : 'Previsão indisponível. Atualize no planejamento.'}</p>}
    {confirmEnd && trip && <div role="dialog" aria-modal="true" aria-label="Encerrar viagem programada" className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"><div className="bg-white p-5 rounded-2xl max-w-sm space-y-4"><h3 className="font-bold">Encerrar esta viagem?</h3><p className="text-sm text-slate-600">{props.activeTrip ? 'A navegação será interrompida.' : 'O roteiro deixará de estar programado.'} Você poderá consultar a viagem encerrada no histórico.</p><div className="flex gap-2"><button onClick={() => setConfirmEnd(false)} className="p-3 border rounded-xl">Manter viagem</button><button onClick={() => { props.onEndTrip(trip); setConfirmEnd(false); }} className="p-3 bg-rose-700 text-white rounded-xl">Sim, encerrar</button></div></div></div>}
  </div>;
}

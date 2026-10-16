import { useConvoyGps } from './hooks/useConvoyGps';
import { getDeviceId } from './services/deviceIdentity';
import { SyncConflictPanel } from './components/SyncConflictPanel';
import type { StateConflict } from './services/stateMerge';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  TripPlan, 
  Vehicle, 
  TravelerProfile, 
  FuelLog, 
  Achievement 
} from './types';
import { storageService } from './services/storageService';
import { generateVerifiedTouristCircuit } from './services/touristCircuit';
import { cloudState } from './services/cloudState';
import { convoyService } from './services/convoyService';
import { NavigationTabBar, MainTabType } from './components/NavigationTabBar';
import { HomeTab } from './components/HomeTab';
import { NavigationHome } from './components/NavigationHome';
import { MapTab } from './components/MapTab';
import { ToursTab } from './components/ToursTab';
import { SavedTab } from './components/SavedTab';
import { ProfileAndSettingsTab } from './components/ProfileAndSettingsTab';
import { RoutePlanningModal } from './components/RoutePlanningModal';
import { ShareTripModal } from './components/ShareTripModal';
import { ConvoyScreen } from './components/ConvoyScreen';
import { ActiveTripModal } from './components/ActiveTripModal';
import { SosModal } from './components/SosModal';
import { useLiveRouteConditions } from './hooks/useLiveRouteConditions';
import { useTripTracking } from './hooks/useTripTracking';
import { getCurrentDeviceLocation } from './services/locationService';
import { useAuth } from './contexts/AuthContext';
import { X, Users, ArrowRight, KeyRound, CornerUpLeft } from 'lucide-react';
import { isNativeApp, TravelNative } from './services/nativeApp';
import {GUEST_NAVIGATION_VEHICLE} from './services/guestNavigationVehicle';

export default function App() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<MainTabType>('inicio');
  const [advancedHome, setAdvancedHome] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [profile, setProfile] = useState<TravelerProfile>(storageService.getProfile());
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [trips, setTrips] = useState<TripPlan[]>([]);
  
  // Modal states
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const [planningOrigin, setPlanningOrigin] = useState('');
  const [planningDestination, setPlanningDestination] = useState('');
  const [planningDestinationCoords, setPlanningDestinationCoords] = useState<[number, number]>([-22.7394, -45.5914]);
  const [planningOriginCoords, setPlanningOriginCoords] = useState<[number, number]>([-23.5505, -46.6333]);
  const [planningTrip, setPlanningTrip] = useState<TripPlan | undefined>();

  const [shareTripTarget, setShareTripTarget] = useState<TripPlan | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripPlan | null>(null);
  const [activeConvoyId, setActiveConvoyId] = useState<string | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [convoyVersion, setConvoyVersion] = useState(0);
  const [joinCode, setJoinCode] = useState('');
  const [joinVehicleType, setJoinVehicleType] = useState<'car' | 'motorcycle' | ''>('');
  const [showJoin, setShowJoin] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [syncState, setSyncState] = useState('loading');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncConflicts,setSyncConflicts]=useState<StateConflict[]>([]);
  const [deviceId]=useState(getDeviceId);
  const [exitNotice,setExitNotice] = useState(false);
  const exitIntentAt = useRef(0);
  useEffect(()=>{
    if (!isNativeApp()) return;
    const back=()=>{
      // Prioridade: fechar overlays e menus; nenhum botão voltar deve encerrar a viagem.
      const closeOverlay = new Event('rdv:close-overlay',{cancelable:true});
      window.dispatchEvent(closeOverlay);
      if(closeOverlay.defaultPrevented){setExitNotice(false);return;}
      if(isSosOpen){setIsSosOpen(false);return;}
      if(isPlanningOpen){setIsPlanningOpen(false);return;}
      if(shareTripTarget){setShareTripTarget(null);return;}
      if(showJoin){setShowJoin(false);return;}
      if(activeConvoyId){setActiveConvoyId(null);return;}
      if(isNavigationOpen){setIsNavigationOpen(false);return;}
      if(advancedHome){setAdvancedHome(false);return;}
      if(activeTab!=='inicio'){setActiveTab('inicio');setAdvancedHome(false);return;}
      if(Date.now()-exitIntentAt.current<1900){void TravelNative.exitApp();return;}
      exitIntentAt.current=Date.now();setExitNotice(true);
    };
    window.addEventListener('rdv:android-back',back);
    return()=>window.removeEventListener('rdv:android-back',back);
  },[isSosOpen,isPlanningOpen,shareTripTarget,showJoin,activeConvoyId,isNavigationOpen,advancedHome,activeTab]);
  useEffect(()=>{
    if(!exitNotice)return;
    const timer=window.setTimeout(()=>setExitNotice(false),2000);
    return()=>window.clearTimeout(timer);
  },[exitNotice]);

  const ownsTracking=activeTrip?.trackingDeviceId===deviceId;
  const tracking = useTripTracking(ownsTracking ? activeTrip?.id : undefined);
  const convoyGps=useConvoyGps(auth.user?.id,accountReady);

  const reloadAccount = (name?: string) => {
    setVehicles(storageService.getVehicles());
    setSelectedVehicleId(storageService.getSelectedVehicleId());
    setProfile(storageService.getProfile(name));
    setFuelLogs(storageService.getFuelLogs());
    setAchievements(storageService.getAchievements());
    setTrips(storageService.getTrips());
    const active = storageService.getActiveTrip();
    setActiveTrip(active);
    setIsNavigationOpen(open => active ? open : false);
    // Keep navigation on the current screen when remote account data arrives.
    setActiveConvoyId(open=>open&&convoyService.getConvoys().some(c=>c.id===open)?open:null);
  };

  useEffect(() => {
    if (auth.loading) return;
    let disposed = false;
    let hydrated = false;
    setAccountReady(false);
    setActiveTrip(null);
    setIsNavigationOpen(false);
    setIsPlanningOpen(false);
    setShareTripTarget(null);
    setActiveConvoyId(null);
    convoyService.clear();
    void cloudState.connect(auth.user, (state, message, conflicts) => {
      if (disposed) return;
      setSyncState(state);
      setSyncMessage(message || '');
      if(conflicts)setSyncConflicts(conflicts);else if(state!=='conflict')setSyncConflicts([]);
      if (!hydrated && ['guest', 'synced', 'pending','offline','conflict'].includes(state)) {
        hydrated = true;
        reloadAccount(auth.user?.displayName);
        setAccountReady(true);
      }
    });
    return () => { disposed = true; cloudState.stop(); };
  }, [auth.loading, auth.user?.id]);

  useEffect(() => {
    if (!auth.user || !accountReady) return;
    let disposed = false;
    const refresh = () => { convoyService.expireLocations(); void convoyService.refresh().then(() => { if (!disposed) setConvoyVersion(v => v + 1); }).catch(() => {}); };
    refresh(); const timer = window.setInterval(refresh, 15000);
    return () => { disposed = true; clearInterval(timer); };
  }, [auth.user?.id, accountReady]);

  useEffect(()=>{const changed=()=>setConvoyVersion(v=>v+1);window.addEventListener('rdv:convoys-changed',changed);return()=>window.removeEventListener('rdv:convoys-changed',changed);},[]);

  useEffect(() => { const refresh = () => reloadAccount(auth.user?.displayName); window.addEventListener('rdv:remote-state', refresh); return () => window.removeEventListener('rdv:remote-state', refresh); }, [auth.user?.id]);

  const currentVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0] || null;

  const currentConvoy=convoyService.getActiveConvoy();
  const conditionsTrip=activeTrip || (activeTab === 'mapa' ? trips.find(t => t.status === 'planned') || null : null);
  const conditionsVehicle=vehicles.find(v => v.id === conditionsTrip?.vehicleId) || currentVehicle;
  const conditions=useLiveRouteConditions(conditionsTrip,conditionsVehicle?.type || 'car',(id,patch) => {
    const saved=storageService.getTrips().find(t => t.id === id);
    if(!saved || !['planned','in_progress'].includes(saved.status))return;
    storageService.saveTrip({...saved,...patch});setTrips(storageService.getTrips());
    const running=storageService.getActiveTrip();
    if(running?.id === id){const updated={...running,...patch};storageService.setActiveTrip(updated);setActiveTrip(updated);}
  },accountReady && !!conditionsVehicle && !!conditionsTrip,activeTrip ? tracking.position : null);

  const handleCreateConvoy = async (trip: TripPlan) => {
    if (!auth.user) { auth.promptLogin(); return; }
    if (!currentVehicle) { setAppError('Escolha ou cadastre seu veículo antes de criar o Comboio.'); return; }
    try {
      const convoy = await convoyService.createConvoy({ title: `Comboio: ${trip.title}`, trip,
        organizerUser: { id: profile.id, name: profile.name, vehicleType: currentVehicle?.type || 'motorcycle', vehicleNickname: currentVehicle?.nickname },
        meetingPoints: [{ id: crypto.randomUUID(), title: 'Ponto de encontro inicial', category: 'minha_escolha', coords: trip.originCoords, order: 1, confirmedArrivedParticipantIds: [] }] });
      setActiveConvoyId(convoy.id);
    } catch (error) { setAppError((error as Error).message); }
  };
  const joinConvoy = async () => {
    if (!auth.user) { setShowJoin(false); auth.promptLogin(); return; }
    const vehicleType = currentVehicle?.type || joinVehicleType;
    if (!vehicleType) { setJoinError('Selecione o tipo de veículo para participar do comboio.'); return; }
    if (joinBusy) return;
    setJoinError(''); setJoinBusy(true);
    try {
      const result = await convoyService.joinConvoyByCode(joinCode.trim(), {
        id: profile.id, name: profile.name, vehicleType, vehicleNickname: currentVehicle?.nickname
      });
      setActiveConvoyId(result.convoy.id);
      setShowJoin(false);
      setJoinCode('');
      setJoinVehicleType('');
    } catch (error) { setJoinError((error as Error).message); }
    finally { setJoinBusy(false); }
  };

  // Handle vehicle selection
  const handleSelectVehicle = (id: string) => {
    setSelectedVehicleId(id);
    storageService.setSelectedVehicleId(id);
  };

  // Add or update vehicle
  const handleAddOrUpdateVehicle = (v: Vehicle) => {
    storageService.addOrUpdateVehicle(v);
    const updated = storageService.getVehicles();
    setVehicles(updated);
    setSelectedVehicleId(v.id);
  };

  // Delete vehicle
  const handleDeleteVehicle = (id: string) => {
    if (activeTrip?.vehicleId === id) { setAppError('Encerre a viagem antes de remover o veículo em uso.'); return; }
    storageService.deleteVehicle(id);
    setVehicles(storageService.getVehicles());
    setSelectedVehicleId(storageService.getSelectedVehicleId());
  };

  // Add fuel log
  const handleAddFuelLog = (log: FuelLog) => {
    storageService.addFuelLog(log);
    setFuelLogs(storageService.getFuelLogs());
    setVehicles(storageService.getVehicles());
  };

  // Open Route Planning Modal
  const handleOpenRoutePlanner = (origin: string, dest: string, coords?: [number, number], originCoords?: [number, number]) => {
    if (!coords || !originCoords) {
      setAppError('Escolha pontos com localização conhecida para planejar esta rota. A busca de endereços ainda não está disponível.');
      return;
    }
    setPlanningOrigin(origin);
    setPlanningDestination(dest);
    setPlanningDestinationCoords(coords);
    setPlanningOriginCoords(originCoords);
    const existing = [activeTrip, ...trips].find(trip => trip && ['planned', 'in_progress'].includes(trip.status) && trip.originName === origin && trip.destinationName === dest && JSON.stringify(trip.originCoords) === JSON.stringify(originCoords) && JSON.stringify(trip.destinationCoords) === JSON.stringify(coords));
    setPlanningTrip(existing || undefined);
    setIsNavigationOpen(false);
    setAppError(null);
    setIsPlanningOpen(true);
  };

  // Start a trip
  const handleStartTrip = (trip: TripPlan) => {
    if (activeTrip && activeTrip.id !== trip.id) { setAppError('Encerre a viagem em andamento antes de iniciar outra.'); return; }
    if (activeTrip?.id === trip.id) { const updated = { ...trip, status: 'in_progress' as const, startedAt: activeTrip.startedAt, trackedDistanceKm: storageService.getActiveTrip()?.trackedDistanceKm || activeTrip.trackedDistanceKm, trackingDeviceId:deviceId }; storageService.saveTrip(updated); storageService.setActiveTrip(updated); setActiveTrip(updated); setTrips(storageService.getTrips()); setIsPlanningOpen(false); setIsNavigationOpen(true); return; }
    if (trip.routingSource !== 'OSRM') { setAppError('Recalcule esta rota antiga antes de iniciar: ela ainda não possui um percurso rodoviário verificado.'); return; }
    setIsPlanningOpen(false);
    const startedTrip: TripPlan = ['completed', 'cancelled'].includes(trip.status)
      ? { ...trip, id: `trip-${Date.now()}`, status: 'in_progress', startedAt: new Date().toISOString(), trackedDistanceKm: 0, trackingDeviceId:deviceId, endedAt: undefined, createdAt: new Date().toISOString(), completedAt: undefined, actualDistanceKm: undefined, actualTraveledVerifiedGps: undefined }
      : { ...trip, status: 'in_progress', startedAt: new Date().toISOString(), trackedDistanceKm: 0, trackingDeviceId:deviceId };
    storageService.saveTrip(startedTrip);
    storageService.setActiveTrip(startedTrip);
    setActiveTrip(startedTrip);
    setIsNavigationOpen(true);
    setTrips(storageService.getTrips());
  };

  const resumeNavigation=()=>{if(!activeTrip)return;handleStartTrip({...activeTrip,trackingDeviceId:deviceId});};

  // Save trip without starting
  const handleSaveTrip = (trip: TripPlan) => {
    if (activeTrip?.id === trip.id) { trip = { ...trip, status: 'in_progress', startedAt: activeTrip.startedAt, trackedDistanceKm: storageService.getActiveTrip()?.trackedDistanceKm,trackingDeviceId:activeTrip.trackingDeviceId }; storageService.setActiveTrip(trip); setActiveTrip(trip); }
    storageService.saveTrip(trip);
    setTrips(storageService.getTrips());
    setIsPlanningOpen(false);
    setActiveTab('salvos');
  };

  // Complete active trip
  const handleCompleteTrip = (tripId: string, actualKm: number, verifiedGps: boolean) => {
    const res = storageService.completeTrip(tripId, actualKm, verifiedGps);
    setProfile(res.updatedProfile);
    setAchievements(storageService.getAchievements());
    setVehicles(storageService.getVehicles());
    setTrips(storageService.getTrips());
    setActiveTrip(null);
    setIsNavigationOpen(false);
    return {
      newAchievements: res.newAchievementsUnlocked,
      leveledUp: false
    };
  };

  const handleEndTrip = (trip: TripPlan) => {
    storageService.saveTrip({ ...(storageService.getActiveTrip()?.id === trip.id ? storageService.getActiveTrip()! : trip), status: 'cancelled', endedAt: new Date().toISOString() });
    if (activeTrip?.id === trip.id) { storageService.setActiveTrip(null); setActiveTrip(null); setIsNavigationOpen(false); }
    setTrips(storageService.getTrips());
  };

  // Delete saved trip
  const handleDeleteTrip = (tripId: string) => {
    if (activeTrip?.id === tripId) { setAppError('Encerre a viagem antes de excluí-la do histórico.'); return; }
    const updated = trips.filter(t => t.id !== tripId);
    storageService.saveTrips(updated);
    setTrips(updated);
  };

  // Launch circular tour ("Passear e Voltar")
  const handleLaunchCircularTour = async (params: { distanceKm?: number; durationHours?: number; budget?: number; returnHour?: string; isSurprise?: boolean }) => {
    if (!currentVehicle) { setAppError('Cadastre um veículo em Ajustes → Minha Garagem.'); return; }
    if (params.budget) { setAppError('Para gerar por orçamento, informe primeiro um preço de combustível no planejamento. Use Por Km ou Por Horas no Início.'); return; }
    try {
      const position = await getCurrentDeviceLocation();
      const hoursUntilReturn = params.returnHour ? (new Date(new Date().toDateString() + ' ' + params.returnHour).getTime() - Date.now()) / 3600000 : undefined;
      if (hoursUntilReturn !== undefined && hoursUntilReturn <= 0) throw new Error('Escolha um horário de retorno futuro.');
      const trip = await generateVerifiedTouristCircuit({ mode: params.durationHours || hoursUntilReturn ? 'hours' : 'km', target: params.durationHours || hoursUntilReturn || params.distanceKm || 100,
        tripType: 'round_trip', interests: ['mirante', 'parque', 'museu'], originCoords: position.coords, originName: 'Sua localização atual', vehicle: currentVehicle });
      setPlanningOrigin(trip.originName); setPlanningOriginCoords(trip.originCoords); setPlanningDestination(trip.destinationName); setPlanningDestinationCoords(trip.destinationCoords);
      setPlanningTrip(trip); setIsNavigationOpen(false); setIsPlanningOpen(true);
    } catch (error) { setAppError((error as Error).message); }
  };

  // Return home action ("Quero voltar pra casa" - Requirement #11)
  const handleReturnHome = async () => {
    if (!profile.homeCoordinates || !profile.homeAddress) {
      setAppError('Cadastre o endereço e a localização da sua casa antes de calcular o retorno.');
      return;
    }
    try {
      const position = await getCurrentDeviceLocation();
      handleOpenRoutePlanner('Sua Localização Atual', `Casa (${profile.homeAddress})`, profile.homeCoordinates, position.coords);
    } catch (error) {
      setAppError((error as Error).message);
    }
  };

  if (auth.loading || !accountReady) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
      <div className="bg-white border rounded-2xl p-6 max-w-md w-full text-center space-y-3">
        <h1 className="font-bold text-slate-900">Rolê</h1>
        <p className="text-sm text-slate-600">{syncState === 'conflict' ? syncMessage : syncState === 'error' ? (syncMessage || 'Não foi possível carregar a conta.') : 'Carregando seus dados de viagem...'}</p>
        {syncState === 'error' && <button type="button" onClick={() => void cloudState.retry()} className="px-4 py-2 bg-emerald-700 text-white rounded-xl">Tentar novamente</button>}
        {syncState === 'conflict' && <SyncConflictPanel conflicts={syncConflicts} onChoose={choice=>void cloudState.resolveConflict(choice)} />}
      </div>
    </div>
  );

  return (
    <div className={`bg-slate-50 text-slate-900 flex flex-col font-sans ${(activeTab==='inicio'||activeTab==='mapa')&&!advancedHome?'h-[100dvh] overflow-hidden':'min-h-screen'}`}>
      {auth.user && syncState !== 'synced' && <div role="status" className="px-4 py-2 text-xs bg-amber-50 text-amber-950 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
        <span>{syncState === 'pending' ? 'Salvando suas viagens na conta...' : syncState === 'conflict' ? syncMessage : syncMessage || 'Seus dados ainda não foram salvos no servidor.'}</span>
        {['error','offline'].includes(syncState) && <button onClick={() => void cloudState.retry()} className="underline font-semibold">Tentar salvar novamente</button>}
        {syncState === 'conflict' && <SyncConflictPanel conflicts={syncConflicts} onChoose={choice=>void cloudState.resolveConflict(choice)} />}
      </div>}
      {/* Conta/login agora ficam em Perfil, mantendo o mapa limpo. */}
      {convoyGps.session && !activeConvoyId && <div role="status" className="p-3 bg-violet-50 text-violet-900 text-xs flex flex-wrap items-center gap-3"><span>{convoyGps.ready?'GPS do comboio ativo':'Comboio aguardando GPS'} · atualização automática</span><button onClick={()=>setActiveConvoyId(convoyGps.session!.convoyId)} className="underline font-bold">Abrir comboio</button><button onClick={()=>void convoyService.stopSharing()} className="underline">Parar compartilhamento</button>{convoyGps.error&&<span>{convoyGps.error}</span>}</div>}
      {showJoin && <div className="fixed inset-0 z-[95] bg-slate-950/50 flex items-end sm:items-center justify-center px-0 sm:px-4"
        role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget && !joinBusy){setShowJoin(false);setJoinError('');}}}>
        <section role="dialog" aria-modal="true" aria-label="Entrar no comboio"
          onKeyDown={event=>{if(event.key==='Escape'&&!joinBusy){setShowJoin(false);setJoinError('');}}}
          className="w-full max-w-md bg-white rounded-t-[30px] sm:rounded-[28px] p-5 sm:p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl animate-[role-dialog-enter_.28s_cubic-bezier(.22,1,.36,1)_both]">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex gap-3 items-center">
              <span className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><Users size={24}/></span>
              <div><h2 className="text-xl font-extrabold text-slate-950">Entrar no comboio</h2>
                <p className="text-xs text-slate-500 mt-1">Participe de uma viagem em grupo</p></div>
            </div>
            <button type="button" aria-label="Fechar entrada no comboio" disabled={joinBusy}
              onClick={()=>{setShowJoin(false);setJoinError('');}}
              className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center disabled:opacity-50"><X size={19}/></button>
          </div>
          <form onSubmit={event=>{event.preventDefault();void joinConvoy();}} className="space-y-4">
            <label className="block text-xs text-slate-700 font-bold">Código do comboio
              <span className="mt-2 flex gap-3 items-center border border-slate-200 bg-slate-50 rounded-2xl px-4 h-14 focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400">
                <KeyRound size={19} className="text-blue-700 shrink-0"/>
                <input aria-label="Código do comboio" autoFocus autoComplete="off" required maxLength={64} value={joinCode}
                  onChange={e=>{setJoinCode(e.target.value);if(joinError)setJoinError('');}}
                  placeholder="Digite o código recebido" className="bg-transparent outline-none flex-1 min-w-0 text-sm font-medium text-slate-900"/>
              </span>
            </label>
            {!currentVehicle && <label className="block text-xs text-slate-700 font-bold">Seu veículo
              <select aria-label="Tipo de veículo no comboio" required value={joinVehicleType}
                onChange={e=>setJoinVehicleType(e.target.value as 'car' | 'motorcycle' | '')}
                className="mt-2 block w-full border border-slate-200 bg-slate-50 rounded-2xl px-4 h-12 text-sm text-slate-800">
                <option value="">Escolha seu veículo</option><option value="motorcycle">Moto</option><option value="car">Carro</option>
              </select>
            </label>}
            <p className="text-xs leading-relaxed text-slate-600 bg-blue-50/70 rounded-xl p-3">
              Seu nome e tipo de veículo serão vistos pelos participantes. A localização ao vivo começa desligada.
            </p>
            {joinError && <p role="alert" className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-xl p-3">{joinError}</p>}
            <button type="submit" disabled={joinBusy || !joinCode.trim()} className="w-full rounded-2xl h-13 min-h-13 px-4 py-3.5 bg-blue-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
              {joinBusy?'Entrando...':'Entrar'}{!joinBusy && <ArrowRight size={19}/>}
            </button>
          </form>
        </section>
      </div>}
      {appError && (
        <div role="alert" className="fixed top-3 left-3 right-3 z-70 mx-auto max-w-xl p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-3 shadow-lg">
          <span className="flex-1">{appError}</span>
          <button aria-label="Fechar aviso" onClick={() => setAppError(null)}>✕</button>
        </div>
      )}
      {/* If Convoy Screen is active, display Convoy view with full screen */}
      {activeConvoyId ? (
        <ConvoyScreen 
          convoyId={activeConvoyId}
          currentUserId={profile.id}
          currentUserName={profile.name}
          currentVehicle={currentVehicle}
          locationState={convoyGps}
          organizerTrip={trips.find(t=>t.id===convoyService.getConvoys().find(c=>c.id===activeConvoyId)?.tripId)}
          onBack={() => setActiveConvoyId(null)}
          onEndConvoy={() => {
            setActiveConvoyId(null);
          }}
        />
      ) : (
        <>
          {/* MAIN TABS CONTAINER */}
          <main className="flex-1 min-h-0 relative">
            {activeTab === 'inicio' && !advancedHome && (
              <NavigationHome
                currentVehicle={currentVehicle}
                trips={trips}
                onLaunchTouristCircuit={(trip) => {
                  setPlanningOrigin(trip.originName);
                  setPlanningOriginCoords(trip.originCoords);
                  setPlanningDestination(trip.destinationName);
                  setPlanningDestinationCoords(trip.destinationCoords);
                  setPlanningTrip(trip);
                  setIsNavigationOpen(false);
                  setIsPlanningOpen(true);
                }}
                onStartTrip={handleStartTrip}
                onOpenAllTrips={() => setActiveTab('salvos')}
                onOpenAllSuggestions={() => setActiveTab('passeios')}
                onOpenProfile={() => setActiveTab('ajustes')}
                onAdvancedPlanning={() => setAdvancedHome(true)}
                onViewTripDetails={(trip) => {
                  setPlanningOrigin(trip.originName);
                  setPlanningOriginCoords(trip.originCoords);
                  setPlanningDestination(trip.destinationName);
                  setPlanningDestinationCoords(trip.destinationCoords);
                  setPlanningTrip(trip);
                  setIsPlanningOpen(true);
                }}
              />
            )}
            {activeTab === 'inicio' && advancedHome && (
              <div><button type="button" className="fixed top-5 right-4 z-[62] flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-lg border border-blue-200 px-4 py-3 text-[14px] font-bold text-blue-700 shadow-[0_6px_24px_#1e40af24] active:scale-95 transition-transform" onClick={() => setAdvancedHome(false)}><CornerUpLeft size={20}/> Voltar ao Rolê</button><HomeTab
                currentVehicle={currentVehicle}
                vehicles={vehicles}
                onSelectVehicle={handleSelectVehicle}
                onOpenRoutePlanner={handleOpenRoutePlanner}
                onLaunchTouristCircuit={(circuitTrip) => {
                  setPlanningOrigin(circuitTrip.originName);
                  setPlanningOriginCoords(circuitTrip.originCoords);
                  setPlanningDestination(circuitTrip.destinationName);
                  setPlanningDestinationCoords(circuitTrip.destinationCoords);
                  setPlanningTrip(circuitTrip);
                  setIsNavigationOpen(false);
                  setIsPlanningOpen(true);
                }}
                onOpenConvoyList={() => {
                  const firstConv = convoyService.getActiveConvoy() || convoyService.getConvoys().find(c => c.status === 'active' && c.participants.some(p => p.id === profile.id));
                  if (firstConv) setActiveConvoyId(firstConv.id);
                }}
                onNavigateToMapTab={() => setActiveTab('mapa')}
                activeConvoyId={convoyService.getActiveConvoy()?.id}
              /></div>
            )}

            {activeTab === 'mapa' && (
              <MapTab
                currentVehicle={currentVehicle}
                convoyParticipants={currentConvoy?.participants}
                meetingPoints={currentConvoy?.meetingPoints}
                activeTrip={activeTrip}
                conditions={conditions}
                routeVehicleType={conditionsVehicle?.type}
                plannedTrip={trips.find(trip => trip.status === 'planned') || null}
                onBackToMenu={() => setActiveTab('inicio')}
                onEndTrip={handleEndTrip}
                onContinueTrip={resumeNavigation}
                activeConvoyId={activeConvoyId}
                onOpenRoutePlanner={handleOpenRoutePlanner}
                onNavigateHome={handleReturnHome}
                sosOpen={isSosOpen}
                onOpenSos={() => setIsSosOpen(true)}
                onStartTrip={handleStartTrip}
                onOpenShareModal={(trip) => setShareTripTarget(trip)}
                onEndConvoy={() => setActiveConvoyId(null)}
                onOpenConvoyModal={trip => void handleCreateConvoy(trip)}
              />
            )}

            {activeTab === 'passeios' && (
              <ToursTab
                currentVehicle={currentVehicle}
                onLaunchCircularTour={handleLaunchCircularTour}
                onOpenCommunityRoute={() => setAppError('Ainda não há roteiros publicados pela comunidade.')}
              />
            )}

            {activeTab === 'salvos' && (
              <SavedTab
                trips={trips}
                vehicles={vehicles}
                onStartTrip={handleStartTrip}
                onOpenShareModal={(trip) => setShareTripTarget(trip)}
                onDeleteTrip={handleDeleteTrip}
                onOpenConvoyModal={trip => void handleCreateConvoy(trip)}
              />
            )}

            {activeTab === 'ajustes' && (
              <ProfileAndSettingsTab
                profile={profile}
                vehicles={vehicles}
                fuelLogs={fuelLogs}
                achievements={achievements}
                trips={trips}
                selectedVehicleId={selectedVehicleId}
                onUpdateProfile={(p) => {
                  setProfile(p);
                  storageService.saveProfile(p);
                }}
                onSelectVehicle={handleSelectVehicle}
                onAddOrUpdateVehicle={handleAddOrUpdateVehicle}
                onDeleteVehicle={handleDeleteVehicle}
                onAddFuelLog={handleAddFuelLog}
                onOpenSosModal={() => setIsSosOpen(true)}
                onNavigateHome={handleReturnHome}
                accountLabel={auth.user?.displayName}
                onLogin={auth.promptLogin}
                onLogout={() => auth.logout().catch(error => setAppError(error.message))}
                onOpenConvoy={() => {setJoinError('');setShowJoin(true);}}
              />
            )}
          </main>

          {exitNotice && <div role="status" className="fixed bottom-28 left-6 right-6 z-[100] mx-auto max-w-sm rounded-2xl bg-slate-950/90 text-white px-5 py-4 text-center text-[14px] font-semibold shadow-xl">Volte novamente para sair do Rolê</div>}
          {!isNavigationOpen && !isPlanningOpen && <NavigationTabBar
            activeTab={activeTab}
            onTabChange={(tab) => {setActiveTab(tab);if(tab==='inicio')setAdvancedHome(false);}}
            hasActiveConvoy={!!convoyService.getActiveConvoy()}
            signedIn={Boolean(auth.user)}
            userName={auth.user?.displayName || profile.name}
          />}
        </>
      )}

      {activeTrip && !isNavigationOpen && !activeConvoyId && <div className="fixed bottom-3 left-3 right-3 z-40 mx-auto max-w-md bg-emerald-900 text-white rounded-xl shadow-lg p-3 flex items-center justify-between gap-3 text-xs"><span>Viagem em andamento · {activeTrip.destinationName}</span><button onClick={resumeNavigation} className="font-bold underline">{ownsTracking?'Retomar mapa':'Assumir navegação neste aparelho'}</button><button onClick={() => { setActiveTab('mapa'); }} className="underline">Opções</button></div>}

      {/* ROUTE PLANNING MODAL (6 MODALITIES COMPARISON) */}
      {currentVehicle && isPlanningOpen && (
        <RoutePlanningModal
          origin={planningOrigin}
          destination={planningDestination}
          destinationCoords={planningDestinationCoords}
          originCoords={planningOriginCoords}
          presetTrip={planningTrip}
          vehicle={currentVehicle}
          isOpen={isPlanningOpen}
          onClose={() => setIsPlanningOpen(false)}
          onStartTrip={handleStartTrip}
          onSaveTrip={handleSaveTrip}
          onOpenShareModal={(trip) => setShareTripTarget(trip)}
        />
      )}

      {/* SHARE MODAL (ROUTE SHARE VS COMBOIO DE VIAGEM) */}
      {shareTripTarget && (
        <ShareTripModal
          trip={shareTripTarget}
          currentVehicle={currentVehicle}
          currentUserId={profile.id}
          currentUserName={profile.name}
          isOpen={!!shareTripTarget}
          onClose={() => setShareTripTarget(null)}
          onOpenConvoy={(convoyId) => {
            setShareTripTarget(null);
            setActiveConvoyId(convoyId);
          }}
        />
      )}

      {/* ACTIVE TRIP NAVIGATION HUD */}
      {activeTrip && isNavigationOpen && !activeConvoyId && (
        <ActiveTripModal
          trip={activeTrip}
          vehicle={vehicles.find(v => v.id === activeTrip.vehicleId) || currentVehicle || GUEST_NAVIGATION_VEHICLE}
          convoyParticipants={currentConvoy?.participants}
          meetingPoints={currentConvoy?.meetingPoints}
          tracking={ownsTracking?tracking:{...tracking,distanceKm:activeTrip.trackedDistanceKm||0,error:'O GPS desta viagem está em outro aparelho. Retome a navegação neste aparelho para usá-lo aqui.',retry:resumeNavigation}}
          conditions={conditions}
          isOpen={!!activeTrip}
          onClose={() => { setIsNavigationOpen(false); setActiveTab('inicio'); }}
          onEndTrip={() => handleEndTrip(activeTrip)}
          onCompleteTrip={handleCompleteTrip}
          onOpenSos={() => setIsSosOpen(true)}
          onReturnHome={handleReturnHome}
        />
      )}

      {/* EMERGENCY SOS MODAL */}
      <SosModal
        emergencyContacts={profile.emergencyContacts}
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
      />
    </div>
  );
}


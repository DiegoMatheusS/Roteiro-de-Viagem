/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  TripPlan, 
  Vehicle, 
  TravelerProfile, 
  FuelLog, 
  Achievement 
} from './types';
import { storageService } from './services/storageService';
import { cloudState } from './services/cloudState';
import { convoyService } from './services/convoyService';
import { NavigationTabBar, MainTabType } from './components/NavigationTabBar';
import { HomeTab } from './components/HomeTab';
import { MapTab } from './components/MapTab';
import { ToursTab } from './components/ToursTab';
import { SavedTab } from './components/SavedTab';
import { ProfileAndSettingsTab } from './components/ProfileAndSettingsTab';
import { RoutePlanningModal } from './components/RoutePlanningModal';
import { ShareTripModal } from './components/ShareTripModal';
import { ConvoyScreen } from './components/ConvoyScreen';
import { ActiveTripModal } from './components/ActiveTripModal';
import { SosModal } from './components/SosModal';
import { useTripTracking } from './hooks/useTripTracking';
import { getCurrentDeviceLocation } from './services/locationService';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<MainTabType>('inicio');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [profile, setProfile] = useState<TravelerProfile>(storageService.getProfile());
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [trips, setTrips] = useState<TripPlan[]>([]);
  
  // Modal states
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const [planningOrigin, setPlanningOrigin] = useState('São Paulo - SP (Centro)');
  const [planningDestination, setPlanningDestination] = useState('Campos do Jordão - SP');
  const [planningDestinationCoords, setPlanningDestinationCoords] = useState<[number, number]>([-22.7394, -45.5914]);
  const [planningOriginCoords, setPlanningOriginCoords] = useState<[number, number]>([-23.5505, -46.6333]);
  const [planningTrip, setPlanningTrip] = useState<TripPlan | undefined>();

  const [shareTripTarget, setShareTripTarget] = useState<TripPlan | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripPlan | null>(null);
  const [activeConvoyId, setActiveConvoyId] = useState<string | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [syncState, setSyncState] = useState('loading');
  const [syncMessage, setSyncMessage] = useState('');
  const tracking = useTripTracking(activeTrip?.id);

  const reloadAccount = (name?: string) => {
    setVehicles(storageService.getVehicles());
    setSelectedVehicleId(storageService.getSelectedVehicleId());
    setProfile(storageService.getProfile(name));
    setFuelLogs(storageService.getFuelLogs());
    setAchievements(storageService.getAchievements());
    setTrips(storageService.getTrips());
    const active = storageService.getActiveTrip();
    setActiveTrip(active);
    setIsNavigationOpen(!!active);
    // Convoys are not yet cross-device; do not reuse a previous account's group.
    setActiveConvoyId(convoyService.getActiveConvoy()?.id || null);
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
    void cloudState.connect(auth.user, (state, message) => {
      if (disposed) return;
      setSyncState(state);
      setSyncMessage(message || '');
      if (!hydrated && ['guest', 'synced', 'pending'].includes(state)) {
        hydrated = true;
        reloadAccount(auth.user?.displayName);
        setAccountReady(true);
      }
    });
    return () => { disposed = true; cloudState.stop(); };
  }, [auth.loading, auth.user?.id]);

  const currentVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0] || null;

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
    setPlanningTrip(undefined);
    setIsNavigationOpen(false);
    setAppError(null);
    setIsPlanningOpen(true);
  };

  // Start a trip
  const handleStartTrip = (trip: TripPlan) => {
    setIsPlanningOpen(false);
    const startedTrip: TripPlan = trip.status === 'completed'
      ? { ...trip, id: `trip-${Date.now()}`, status: 'in_progress', createdAt: new Date().toISOString(), completedAt: undefined, actualDistanceKm: undefined, actualTraveledVerifiedGps: undefined }
      : { ...trip, status: 'in_progress' };
    storageService.saveTrip(startedTrip);
    storageService.setActiveTrip(startedTrip);
    setActiveTrip(startedTrip);
    setIsNavigationOpen(true);
    setTrips(storageService.getTrips());
  };

  // Save trip without starting
  const handleSaveTrip = (trip: TripPlan) => {
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

  // Delete saved trip
  const handleDeleteTrip = (tripId: string) => {
    const updated = trips.filter(t => t.id !== tripId);
    storageService.saveTrips(updated);
    setTrips(updated);
  };

  // Launch circular tour ("Passear e Voltar")
  const handleLaunchCircularTour = (params: { distanceKm?: number; durationHours?: number; budget?: number; returnHour?: string; isSurprise?: boolean }) => {
    const origin = 'São Paulo - SP (Local de Saída)';
    let dest = 'Passeio Circular Vale da Mantiqueira';
    let coords: [number, number] = [-22.8, -45.7];

    if (params.distanceKm) {
      dest = `Passeio Circular ${params.distanceKm} km (Estrada das Serras)`;
    } else if (params.durationHours) {
      dest = `Passeio de ${params.durationHours} horas (Circuito Panorâmico)`;
    } else if (params.budget) {
      dest = `Passeio Econômico até R$ ${params.budget}`;
    } else if (params.isSurprise) {
      dest = 'Passeio Surpresa: Rota das Curvas & Mirantes';
    }

    handleOpenRoutePlanner(origin, dest, coords, [-23.5505, -46.6333]);
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
        <h1 className="font-bold text-slate-900">Roteiro de Viagem</h1>
        <p className="text-sm text-slate-600">{syncState === 'conflict' ? syncMessage : syncState === 'error' ? (syncMessage || 'Não foi possível carregar a conta.') : 'Carregando seus dados de viagem...'}</p>
        {syncState === 'error' && <button type="button" onClick={() => void cloudState.retry()} className="px-4 py-2 bg-emerald-700 text-white rounded-xl">Tentar novamente</button>}
        {syncState === 'conflict' && <div className="space-y-2">
          <button type="button" onClick={() => { void cloudState.resolveConflict('server').then(() => reloadAccount(auth.user?.displayName)); }} className="block w-full p-2 border rounded-xl">Usar versão do servidor (mantém cópia local)</button>
          <button type="button" onClick={() => void cloudState.resolveConflict('device')} className="block w-full p-2 border border-amber-500 rounded-xl">Substituir dados do servidor pelos deste aparelho</button>
        </div>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {auth.user && syncState !== 'synced' && <div role="status" className="px-4 py-2 text-xs bg-amber-50 text-amber-950 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2">
        <span>{syncState === 'pending' ? 'Salvando suas viagens na conta...' : syncState === 'conflict' ? syncMessage : syncMessage || 'Seus dados ainda não foram salvos no servidor.'}</span>
        {syncState === 'error' && <button onClick={() => void cloudState.retry()} className="underline font-semibold">Tentar salvar novamente</button>}
        {syncState === 'conflict' && <div className="flex gap-3">
          <button onClick={() => { void cloudState.resolveConflict('server').then(() => reloadAccount(auth.user?.displayName)); }} className="underline">Usar servidor</button>
          <button onClick={() => void cloudState.resolveConflict('device')} className="underline">Usar este dispositivo</button>
        </div>}
      </div>}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-end gap-3 text-xs">
        {auth.user ? <><span className="text-slate-500">Olá, {auth.user.displayName}</span>{auth.user.role === 'admin' && <a href="/admin" className="font-bold text-emerald-700">Painel administrativo</a>}<button onClick={() => auth.logout().catch(error => setAppError(error.message))} className="text-slate-600">Sair da conta</button></> : <button onClick={auth.promptLogin} className="font-bold text-emerald-700">Entrar / Criar conta</button>}
      </div>
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
          onBack={() => setActiveConvoyId(null)}
          onEndConvoy={() => {
            setActiveConvoyId(null);
          }}
        />
      ) : (
        <>
          {/* MAIN TABS CONTAINER */}
          <main className="flex-1">
            {activeTab === 'inicio' && (
              <HomeTab
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
              />
            )}

            {activeTab === 'mapa' && (
              <MapTab
                currentVehicle={currentVehicle}
                activeTrip={activeTrip}
                activeConvoyId={activeConvoyId}
                onOpenRoutePlanner={handleOpenRoutePlanner}
                onNavigateHome={handleReturnHome}
                onOpenSos={() => setIsSosOpen(true)}
                onStartTrip={handleStartTrip}
                onOpenShareModal={(trip) => setShareTripTarget(trip)}
                onEndConvoy={() => setActiveConvoyId(null)}
                onOpenConvoyModal={(trip) => {
                  if (activeConvoyId) {
                    setActiveConvoyId(activeConvoyId);
                    return;
                  }
                  const newConv = convoyService.createConvoy({
                    title: `Comboio: ${trip.title}`,
                    trip,
                    organizerUser: {
                      id: profile.id,
                      name: profile.name,
                      vehicleType: currentVehicle?.type || 'motorcycle',
                      vehicleNickname: currentVehicle?.nickname
                    },
                    meetingPoints: [
                      {
                        id: `mp-${Date.now()}`,
                        title: 'Posto de Saída / Ponto de Encontro',
                        category: 'posto',
                        coords: trip.routePath[1] || trip.originCoords,
                        order: 1,
                        confirmedArrivedParticipantIds: [profile.id]
                      }
                    ]
                  });
                  setActiveConvoyId(newConv.id);
                }}
              />
            )}

            {activeTab === 'passeios' && (
              <ToursTab
                currentVehicle={currentVehicle}
                onLaunchCircularTour={handleLaunchCircularTour}
                onOpenCommunityRoute={(routeId) => {
                  handleOpenRoutePlanner(
                    'São Paulo - SP',
                    'Campos do Jordão (Rota Comunitária)',
                    [-22.7394, -45.5914],
                    [-23.5505, -46.6333]
                  );
                }}
              />
            )}

            {activeTab === 'salvos' && (
              <SavedTab
                trips={trips}
                vehicles={vehicles}
                onStartTrip={handleStartTrip}
                onOpenShareModal={(trip) => setShareTripTarget(trip)}
                onDeleteTrip={handleDeleteTrip}
                onOpenConvoyModal={(trip) => {
                  const newConv = convoyService.createConvoy({
                    title: `Comboio: ${trip.title}`,
                    trip,
                    organizerUser: {
                      id: profile.id,
                      name: profile.name,
                      vehicleType: currentVehicle?.type || 'motorcycle',
                      vehicleNickname: currentVehicle?.nickname
                    },
                    meetingPoints: [
                      {
                        id: `mp-${Date.now()}`,
                        title: 'Posto de Saída / Ponto de Encontro',
                        category: 'posto',
                        coords: trip.routePath[1] || trip.originCoords,
                        order: 1,
                        confirmedArrivedParticipantIds: [profile.id]
                      }
                    ]
                  });
                  setActiveConvoyId(newConv.id);
                }}
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
              />
            )}
          </main>

          {/* BOTTOM NAVIGATION TAB BAR */}
          <NavigationTabBar 
            activeTab={activeTab} 
            onTabChange={setActiveTab}
            hasActiveConvoy={!!convoyService.getActiveConvoy()}
          />
        </>
      )}

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
      {activeTrip && currentVehicle && isNavigationOpen && !activeConvoyId && (
        <ActiveTripModal
          trip={activeTrip}
          vehicle={vehicles.find(v => v.id === activeTrip.vehicleId) || currentVehicle}
          tracking={tracking}
          isOpen={!!activeTrip}
          onClose={() => setIsNavigationOpen(false)}
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

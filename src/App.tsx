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

export default function App() {
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

  const [shareTripTarget, setShareTripTarget] = useState<TripPlan | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripPlan | null>(null);
  const [activeConvoyId, setActiveConvoyId] = useState<string | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);

  // Initialize data on mount
  useEffect(() => {
    const loadedVehicles = storageService.getVehicles();
    setVehicles(loadedVehicles);
    const selId = storageService.getSelectedVehicleId();
    setSelectedVehicleId(selId);
    setProfile(storageService.getProfile());
    setFuelLogs(storageService.getFuelLogs());
    setAchievements(storageService.getAchievements());
    setTrips(storageService.getTrips());
    setActiveTrip(storageService.getActiveTrip());
    const activeConv = convoyService.getActiveConvoy();
    if (activeConv) setActiveConvoyId(activeConv.id);
  }, []);

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
  const handleOpenRoutePlanner = (origin: string, dest: string, coords?: [number, number]) => {
    setPlanningOrigin(origin);
    setPlanningDestination(dest);
    if (coords) setPlanningDestinationCoords(coords);
    setIsPlanningOpen(true);
  };

  // Start a trip
  const handleStartTrip = (trip: TripPlan) => {
    setIsPlanningOpen(false);
    storageService.saveTrip(trip);
    storageService.setActiveTrip(trip);
    setActiveTrip(trip);
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

    handleOpenRoutePlanner(origin, dest, coords);
  };

  // Return home action ("Quero voltar pra casa" - Requirement #11)
  const handleReturnHome = () => {
    const home = profile.homeAddress || 'Av. Paulista, 1578 - São Paulo - SP';
    handleOpenRoutePlanner(
      'Sua Localização Atual',
      `Casa (${home})`,
      profile.homeCoordinates || [-23.5614, -46.6559]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
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
                  storageService.saveTrip(circuitTrip);
                  setTrips(storageService.getTrips());
                  setPlanningOrigin(circuitTrip.originName);
                  setPlanningDestination(circuitTrip.title);
                  setPlanningDestinationCoords(circuitTrip.destinationCoords);
                  setIsPlanningOpen(true);
                }}
                onOpenConvoyList={() => {
                  const firstConv = convoyService.getConvoys()[0];
                  if (firstConv) setActiveConvoyId(firstConv.id);
                }}
                onNavigateToMapTab={() => setActiveTab('mapa')}
                activeConvoyId={activeConvoyId}
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
                    [-22.7394, -45.5914]
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
      {activeTrip && currentVehicle && (
        <ActiveTripModal
          trip={activeTrip}
          vehicle={currentVehicle}
          isOpen={!!activeTrip}
          onClose={() => setActiveTrip(null)}
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

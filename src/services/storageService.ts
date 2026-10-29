import { Vehicle, FuelLog, TravelerProfile, TravelerTier, Achievement, TripPlan, ConvoySession } from '../types';
import { calculateObservedConsumption } from './fuelConsumption';

export interface TravelerSnapshot {
  profile: TravelerProfile;
  vehicles: Vehicle[];
  fuelLogs: FuelLog[];
  achievements: Achievement[];
  trips: TripPlan[];
  activeTrip: TripPlan | null;
  selectedVehicleId: string;
  convoys: ConvoySession[];
  activeConvoyId: string | null;
}


// All account-owned data starts empty. Demo data remains in tests only.
const EMPTY_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-first-trip',
    title: 'Primeira Viagem',
    description: 'Completou a primeira viagem com o aplicativo.',
    icon: 'Compass',
    unlockedAt: null,
    progress: 0,
    target: 1,
    unit: 'viagem',
    category: 'viagens'
  },
  {
    id: 'ach-100km',
    title: 'Primeiro Passeio de 100 km',
    description: 'Percorreu mais de 100 km em uma única viagem concluída.',
    icon: 'MapPin',
    unlockedAt: null,
    progress: 0,
    target: 100,
    unit: 'km',
    category: 'distancia'
  },
  {
    id: 'ach-500km',
    title: 'Primeira Viagem de 500 km',
    description: 'Completou uma jornada épica de pelo menos 500 km.',
    icon: 'Milestone',
    unlockedAt: null,
    progress: 0,
    target: 500,
    unit: 'km',
    category: 'distancia'
  },
  {
    id: 'ach-10-trips',
    title: 'Dez Viagens Concluídas',
    description: 'Completou 10 viagens registradas no seu histórico.',
    icon: 'Award',
    unlockedAt: null,
    progress: 0,
    target: 10,
    unit: 'viagens',
    category: 'viagens'
  },
  {
    id: 'ach-5-states',
    title: 'Cinco Estados Visitados',
    description: 'Cruzou as fronteiras de 5 estados brasileiros diferentes.',
    icon: 'Globe',
    unlockedAt: null,
    progress: 0,
    target: 5,
    unit: 'estados',
    category: 'turismo'
  },
  {
    id: 'ach-first-published',
    title: 'Primeiro Roteiro Publicado',
    description: 'Compartilhou um roteiro turístico com a comunidade.',
    icon: 'Share2',
    unlockedAt: null,
    progress: 0,
    target: 1,
    unit: 'roteiro',
    category: 'comunidade'
  }
];
const newProfile = (id: string, name = 'Viajante'): TravelerProfile => ({
  id, name, bio: '', photoUrl: '',
  isPublicProfile: false,
  showLevelPublicly: false, showMedalsPublicly: false, showKmPublicly: false,
  verifiedGpsKm: 0, manualKm: 0, completedTripsCount: 0, savedRoutesCount: 0,
  publishedRoutesCount: 0, reviewsCount: 0, emergencyContacts: []
});
export const emptyTravelerSnapshot = (id: string, name = 'Viajante'): TravelerSnapshot => ({
  profile:newProfile(id,name),vehicles:[],fuelLogs:[],achievements:EMPTY_ACHIEVEMENTS.map(item=>({...item})),
  trips:[],activeTrip:null,selectedVehicleId:'',convoys:[],activeConvoyId:null
});

// Per-account browser namespaces; never expose another user's data through the guest namespace.
let storageOwner: string | null = null;
const key = (name: string) => `rdv_private_v2_${storageOwner || 'guest'}_${name}`;
const scoped = {
  vehicles: () => key('vehicles'),
  vehicleId: () => key('vehicle_id'),
  fuelLogs: () => key('fuel_logs'),
  profile: () => key('profile'),
  achievements: () => key('achievements'),
  trips: () => key('trips'),
  activeTrip: () => key('active_trip'),
  convoys: () => key('convoys'),
  activeConvoyId: () => key('active_convoy')
};
let changeListener: (() => void) | null = null;
const write = (name: string, value: string) => { localStorage.setItem(name, value); changeListener?.(); };
const drop = (name: string) => { localStorage.removeItem(name); changeListener?.(); };
const readList = <T,>(storageKey: string): T[] => {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
};

export const storageService = {
  setScope(accountId: string | null) { storageOwner = accountId; },
  getScope() { return storageOwner; },
  scopedTripsKey() { return scoped.trips(); },
  setChangeListener(listener: (() => void) | null) { changeListener = listener; },
  getSnapshot(name?: string): TravelerSnapshot {
    return { profile: this.getProfile(name), vehicles: this.getVehicles(), fuelLogs: this.getFuelLogs(), achievements: this.getAchievements(),
      trips: this.getTrips(), activeTrip: this.getActiveTrip(), selectedVehicleId: this.getSelectedVehicleId(),
      convoys: this.getConvoys(), activeConvoyId: this.getActiveConvoyId() };
  },
  replaceSnapshot(state: TravelerSnapshot) {
    // Read-only remote hydration: never emit local-change events during initialization.
    localStorage.setItem(scoped.profile(), JSON.stringify(state.profile));
    localStorage.setItem(scoped.vehicles(), JSON.stringify(state.vehicles));
    localStorage.setItem(scoped.fuelLogs(), JSON.stringify(state.fuelLogs));
    localStorage.setItem(scoped.achievements(), JSON.stringify(state.achievements));
    localStorage.setItem(scoped.trips(), JSON.stringify(state.trips));
    localStorage.setItem(scoped.vehicleId(), state.selectedVehicleId);
    if (state.activeTrip) localStorage.setItem(scoped.activeTrip(), JSON.stringify(state.activeTrip));
    else localStorage.removeItem(scoped.activeTrip());
    localStorage.setItem(scoped.convoys(), JSON.stringify(state.convoys || []));
    if (state.activeConvoyId) localStorage.setItem(scoped.activeConvoyId(), state.activeConvoyId);
    else localStorage.removeItem(scoped.activeConvoyId());
  },
  resetScope(name?: string) {
    this.replaceSnapshot(emptyTravelerSnapshot(storageOwner || crypto.randomUUID(),name));
  },
  getConvoys(): ConvoySession[] { return readList<ConvoySession>(scoped.convoys()); },
  saveConvoys(convoys: ConvoySession[]) { write(scoped.convoys(), JSON.stringify(convoys)); },
  getActiveConvoyId(): string | null { return localStorage.getItem(scoped.activeConvoyId()); },
  setActiveConvoyId(id: string | null) { if (id) write(scoped.activeConvoyId(), id); else drop(scoped.activeConvoyId()); },
  // VEHICLES
  getVehicles(): Vehicle[] {
    return readList<Vehicle>(scoped.vehicles());
  },

  saveVehicles(vehicles: Vehicle[]) {
    write(scoped.vehicles(), JSON.stringify(vehicles));
  },

  getSelectedVehicleId(): string {
    const saved = localStorage.getItem(scoped.vehicleId());
    if (saved) return saved;
    const vehicles = this.getVehicles();
    const defaultVeh = vehicles.find(v => v.isDefault) || vehicles[0];
    const id = defaultVeh ? defaultVeh.id : '';
    if (id) localStorage.setItem(scoped.vehicleId(), id);
    return id;
  },

  setSelectedVehicleId(id: string) {
    write(scoped.vehicleId(), id);
  },

  getSelectedVehicle(): Vehicle | null {
    const vehicles = this.getVehicles();
    const selectedId = this.getSelectedVehicleId();
    return vehicles.find(v => v.id === selectedId) || vehicles[0] || null;
  },

  addOrUpdateVehicle(vehicle: Vehicle) {
    const vehicles = this.getVehicles();
    const idx = vehicles.findIndex(v => v.id === vehicle.id);
    if (idx >= 0) {
      vehicles[idx] = vehicle;
    } else {
      vehicles.push(vehicle);
    }
    this.saveVehicles(vehicles);
    this.setSelectedVehicleId(vehicle.id);
  },

  deleteVehicle(id: string) {
    let vehicles = this.getVehicles();
    vehicles = vehicles.filter(v => v.id !== id);
    this.saveVehicles(vehicles);
    if (this.getSelectedVehicleId() === id) {
      this.setSelectedVehicleId(vehicles[0]?.id || '');
    }
  },

  // FUEL LOGS & CONSUMPTION CALCULATION
  getFuelLogs(vehicleId?: string): FuelLog[] {
    const logs = readList<FuelLog>(scoped.fuelLogs());
    return vehicleId ? logs.filter(log => log.vehicleId === vehicleId) : logs;
  },

  saveFuelLogs(logs: FuelLog[]) {
    write(scoped.fuelLogs(), JSON.stringify(logs));
  },

  addFuelLog(log: FuelLog): { observedAverage?: number } {
    const logs = this.getFuelLogs();
    logs.push(log);
    logs.sort((a, b) => a.odometerKm - b.odometerKm);
    this.saveFuelLogs(logs);

    const observedAvg = calculateObservedConsumption(logs.filter(l => l.vehicleId === log.vehicleId));
    if (observedAvg !== undefined) {
      const vehicles = this.getVehicles();
      const vehicle = vehicles.find(v => v.id === log.vehicleId);
      if (vehicle) {
        vehicle.consumption.observedAverage = observedAvg;
        vehicle.consumption.userConfigured = observedAvg;
        this.saveVehicles(vehicles);
      }
    }

    return { observedAverage: observedAvg };
  },

  // TRAVELER PROFILE & TIERS
  getProfile(name?: string): TravelerProfile {
    try {
      const raw = localStorage.getItem(scoped.profile());
      if (raw) {
        const stored = JSON.parse(raw) as TravelerProfile;
        if (stored && typeof stored.id === 'string' && Array.isArray(stored.emergencyContacts)) return stored;
      }
    } catch { /* Invalid local state is reset to a blank account profile. */ }
    const profile = newProfile(storageOwner || crypto.randomUUID(), name);
    this.saveProfile(profile);
    return profile;
  },

  saveProfile(profile: TravelerProfile) {
    write(scoped.profile(), JSON.stringify(profile));
  },

  getAchievements(): Achievement[] {
    const raw = readList<Achievement>(scoped.achievements());
    return raw.length ? raw : EMPTY_ACHIEVEMENTS.map(item => ({ ...item }));
  },

  saveAchievements(achievements: Achievement[]) {
    write(scoped.achievements(), JSON.stringify(achievements));
  },

  // Calculate traveler tier:
  // Bronze: 0 to 499 km
  // Prata: 500 to 1,999 km
  // Ouro: 2,000 to 9,999 km
  // Diamante: >= 10,000 km
  // Only GPS-recorded distance contributes to levels; manual km remain history.
  calculateTier(profile:Pick<TravelerProfile,'verifiedGpsKm'>): {
    tier: TravelerTier;
    nextTier: TravelerTier | null;
    currentKmInTier: number;
    neededKmForNextTier: number;
    progressPercent: number;
    thresholdMin: number;
    thresholdMax: number;
  } {
    const totalKm=Number.isFinite(profile.verifiedGpsKm)?Math.max(0,profile.verifiedGpsKm):0;
    if (totalKm < 500) {
      return {
        tier: 'Bronze',
        nextTier: 'Prata',
        currentKmInTier: totalKm,
        neededKmForNextTier: 500 - totalKm,
        progressPercent: Math.min(100, Math.round((totalKm / 500) * 100)),
        thresholdMin: 0,
        thresholdMax: 500
      };
    } else if (totalKm < 2000) {
      return {
        tier: 'Prata',
        nextTier: 'Ouro',
        currentKmInTier: totalKm - 500,
        neededKmForNextTier: 2000 - totalKm,
        progressPercent: Math.min(100, Math.round(((totalKm - 500) / 1500) * 100)),
        thresholdMin: 500,
        thresholdMax: 2000
      };
    } else if (totalKm < 10000) {
      return {
        tier: 'Ouro',
        nextTier: 'Diamante',
        currentKmInTier: totalKm - 2000,
        neededKmForNextTier: 10000 - totalKm,
        progressPercent: Math.min(100, Math.round(((totalKm - 2000) / 8000) * 100)),
        thresholdMin: 2000,
        thresholdMax: 10000
      };
    } else {
      return {
        tier: 'Diamante',
        nextTier: null,
        currentKmInTier: totalKm,
        neededKmForNextTier: 0,
        progressPercent: 100,
        thresholdMin: 10000,
        thresholdMax: 10000
      };
    }
  },

  // TRIPS
  getTrips(): TripPlan[] {
    return readList<TripPlan>(scoped.trips());
  },

  saveTrips(trips: TripPlan[]) {
    write(scoped.trips(), JSON.stringify(trips));
  },

  saveTrip(trip: TripPlan) {
    const trips = this.getTrips();
    const idx = trips.findIndex(t => t.id === trip.id);
    if (idx >= 0) {
      trips[idx] = trip;
    } else {
      trips.unshift(trip);
    }
    this.saveTrips(trips);
  },

  getActiveTrip(): TripPlan | null {
    const raw = localStorage.getItem(scoped.activeTrip());
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setActiveTrip(trip: TripPlan | null) {
    if (trip) {
      write(scoped.activeTrip(), JSON.stringify(trip));
    } else {
      drop(scoped.activeTrip());
    }
  },

  // COMPLETE A TRIP AND UPDATE PROFILE, VEHICLE & ACHIEVEMENTS (Requirement #7)
  completeTrip(tripId: string, actualDistanceKm: number, verifiedByGps: boolean): {
    updatedProfile: TravelerProfile;
    newAchievementsUnlocked: Achievement[];
  } {
    if (!Number.isFinite(actualDistanceKm) || actualDistanceKm <= 0) {
      throw new Error('Informe uma distância percorrida válida.');
    }
    const trips = this.getTrips();
    const tripIdx = trips.findIndex(t => t.id === tripId);
    let trip = tripIdx >= 0 ? trips[tripIdx] : null;

    if (!trip) {
      // If it was only an active transient trip
      const active = this.getActiveTrip();
      trip = active?.id === tripId ? active : null;
    }

    if (!trip) throw new Error('Viagem não encontrada.');

    if (trip && trip.status === 'completed') {
      // Prevent double counting (Requirement #7)
      return {
        updatedProfile: this.getProfile(),
        newAchievementsUnlocked: []
      };
    }

    const now = new Date().toISOString();
    if (trip) {
      trip.status = 'completed';
      trip.completedAt = now;
      trip.actualDistanceKm = actualDistanceKm;
      trip.actualTraveledVerifiedGps = verifiedByGps;
      this.saveTrip(trip);
    }
    this.setActiveTrip(null);

    // 1. Update Profile (Requirement #1 & #2: only actually traveled km, distinguish GPS vs manual)
    const profile = this.getProfile();
    profile.completedTripsCount += 1;
    if (verifiedByGps) {
      profile.verifiedGpsKm += actualDistanceKm;
    } else {
      profile.manualKm += actualDistanceKm;
    }
    this.saveProfile(profile);

    // 2. Update Vehicle odometer & stats (Requirement #6)
    if (trip?.vehicleId) {
      const vehicles = this.getVehicles();
      const vIdx = vehicles.findIndex(v => v.id === trip!.vehicleId);
      if (vIdx >= 0) {
        vehicles[vIdx].odometerKm += actualDistanceKm;
        this.saveVehicles(vehicles);
      }
    }

    // 3. Verify Achievements (Requirement #2)
    const achievements = this.getAchievements();
    const newlyUnlocked: Achievement[] = [];

    achievements.forEach(ach => {
      if (ach.unlockedAt) return; // already unlocked

      let shouldUnlock = false;
      if (ach.id === 'ach-first-trip' && profile.completedTripsCount >= 1) {
        ach.progress = profile.completedTripsCount;
        shouldUnlock = true;
      } else if (ach.id === 'ach-100km' && verifiedByGps && actualDistanceKm >= 100) {
        ach.progress = actualDistanceKm;
        shouldUnlock = true;
      } else if (ach.id === 'ach-500km' && verifiedByGps && actualDistanceKm >= 500) {
        ach.progress = actualDistanceKm;
        shouldUnlock = true;
      } else if (ach.id === 'ach-10-trips') {
        ach.progress = profile.completedTripsCount;
        if (profile.completedTripsCount >= 10) shouldUnlock = true;
      } else if (ach.id === 'ach-first-published' && profile.publishedRoutesCount >= 1) {
        ach.progress = 1;
        shouldUnlock = true;
      }

      if (shouldUnlock) {
        ach.unlockedAt = now;
        newlyUnlocked.push(ach);
      }
    });

    this.saveAchievements(achievements);

    return {
      updatedProfile: profile,
      newAchievementsUnlocked: newlyUnlocked
    };
  }
};


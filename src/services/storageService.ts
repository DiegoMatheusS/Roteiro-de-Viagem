import { 
  Vehicle, 
  FuelLog, 
  TravelerProfile, 
  TravelerTier, 
  Achievement, 
  TripPlan, 
  EmergencyContact 
} from '../types';

const STORAGE_KEYS = {
  VEHICLES: 'rdv_vehicles_v1',
  SELECTED_VEHICLE_ID: 'rdv_selected_vehicle_id_v1',
  FUEL_LOGS: 'rdv_fuel_logs_v1',
  PROFILE: 'rdv_traveler_profile_v1',
  TRIPS: 'rdv_trips_v1',
  ACTIVE_TRIP: 'rdv_active_trip_v1'
};

// INITIAL SEED VEHICLES (1 Moto and 1 Car to start with verified Inmetro specs)
const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'veh-moto-1',
    type: 'motorcycle',
    brand: 'Honda',
    model: 'CB 500X / NX 500',
    year: 2024,
    version: '471cc Bicilíndrico DOHC',
    nickname: 'Bicuda 500X',
    fuelType: 'gasolina',
    tankCapacityLiters: 17.7,
    maxPassengers: 2,
    odometerKm: 4280,
    isDefault: true,
    consumption: {
      referenceUrban: 25.5,
      referenceHighway: 29.8,
      referenceAverage: 27.6,
      source: 'Ficha Técnica Homologação Denatran / Duas Rodas',
      sourceDate: 'Março/2024',
      observedAverage: 28.2, // calculated from fuel logs
      userConfigured: 28.2
    }
  },
  {
    id: 'veh-car-1',
    type: 'car',
    brand: 'Chevrolet',
    model: 'Onix',
    year: 2024,
    version: '1.0 Aspirado Flex Manual',
    nickname: 'Onix da Estrada',
    fuelType: 'flex',
    tankCapacityLiters: 44.0,
    maxPassengers: 5,
    odometerKm: 28950,
    isDefault: false,
    consumption: {
      referenceUrban: 13.3,
      referenceHighway: 16.6,
      referenceAverage: 14.9,
      source: 'Inmetro PBEV (Programa Brasileiro de Etiquetagem Veicular)',
      sourceDate: 'Tabela Oficial 2024',
      observedAverage: 15.2,
      userConfigured: 15.2
    }
  }
];

// INITIAL FUEL LOGS FOR MOTO (demonstrating real observed consumption computation)
const INITIAL_FUEL_LOGS: FuelLog[] = [
  {
    id: 'fl-1',
    vehicleId: 'veh-moto-1',
    date: '2026-08-10',
    odometerKm: 3500,
    liters: 15.2,
    pricePerLiter: 5.89,
    totalAmount: 89.53,
    fullTank: true,
    notes: 'Abastecimento inicial tanque cheio'
  },
  {
    id: 'fl-2',
    vehicleId: 'veh-moto-1',
    date: '2026-08-25',
    odometerKm: 3920, // 420 km / 14.9L = 28.18 km/l
    liters: 14.9,
    pricePerLiter: 5.95,
    totalAmount: 88.65,
    fullTank: true,
    notes: 'Passeio Serra da Mantiqueira'
  },
  {
    id: 'fl-3',
    vehicleId: 'veh-moto-1',
    date: '2026-09-15',
    odometerKm: 4280, // 360 km / 12.8L = 28.12 km/l
    liters: 12.8,
    pricePerLiter: 5.89,
    totalAmount: 75.39,
    fullTank: true,
    notes: 'Volta pela serra'
  }
];

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-first-trip',
    title: 'Primeira Viagem',
    description: 'Completou a primeira viagem com o aplicativo.',
    icon: 'Compass',
    unlockedAt: '2026-08-25T17:30:00Z',
    progress: 1,
    target: 1,
    unit: 'viagem',
    category: 'viagens'
  },
  {
    id: 'ach-100km',
    title: 'Primeiro Passeio de 100 km',
    description: 'Percorreu mais de 100 km em uma única viagem concluída.',
    icon: 'MapPin',
    unlockedAt: '2026-08-25T17:30:00Z',
    progress: 185,
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
    progress: 185,
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
    progress: 3,
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
    progress: 2,
    target: 5,
    unit: 'estados',
    category: 'turismo'
  },
  {
    id: 'ach-first-published',
    title: 'Primeiro Roteiro Publicado',
    description: 'Compartilhou um roteiro turístico com a comunidade.',
    icon: 'Share2',
    unlockedAt: '2026-09-02T11:00:00Z',
    progress: 1,
    target: 1,
    unit: 'roteiro',
    category: 'comunidade'
  }
];

const INITIAL_PROFILE: TravelerProfile = {
  id: 'user-pilot-1',
  name: 'Diego Mendes',
  bio: 'Motociclista entusiasta de estradas serranas e viagens de fim de semana.',
  photoUrl: '',
  homeAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP',
  homeCoordinates: [-23.5614, -46.6559],
  isPublicProfile: false,
  showLevelPublicly: true,
  showMedalsPublicly: true,
  showKmPublicly: true,
  verifiedGpsKm: 460, // Checked GPS during actual ride
  manualKm: 85,       // Manually declared
  completedTripsCount: 3,
  savedRoutesCount: 5,
  publishedRoutesCount: 1,
  reviewsCount: 4,
  emergencyContacts: [
    {
      id: 'em-1',
      name: 'Mariana Mendes',
      phone: '(11) 98765-4321',
      relationship: 'Esposa',
      isPrimary: true,
      canReceiveArrivalAlerts: true
    },
    {
      id: 'em-2',
      name: 'Carlos Mendes',
      phone: '(11) 97654-3210',
      relationship: 'Irmão',
      isPrimary: false,
      canReceiveArrivalAlerts: false
    }
  ]
};

// INITIAL TRIPS (Demonstrating planned vs completed history)
const INITIAL_TRIPS: TripPlan[] = [
  {
    id: 'trip-comp-1',
    title: 'Passeio Serra da Mantiqueira',
    originName: 'São Paulo - SP',
    originCoords: [-23.5505, -46.6333],
    destinationName: 'Campos do Jordão - SP',
    destinationCoords: [-22.7394, -45.5914],
    modality: 'panoramica',
    returnModality: 'rapida',
    isCircular: false,
    distanceKm: 185,
    durationMinutes: 195,
    vehicleId: 'veh-moto-1',
    routePath: [
      [-23.5505, -46.6333],
      [-23.2237, -45.9009],
      [-22.9511, -45.4523],
      [-22.7562, -45.5781],
      [-22.7394, -45.5914]
    ],
    stops: [
      {
        id: 'st-hist-1',
        name: 'Mirante Vista Chinesa',
        category: 'mirante',
        lat: -22.7562,
        lng: -45.5781,
        description: 'Parada fotográfica na subida da serra.',
        recommendedMinutes: 25
      }
    ],
    weatherPoints: [
      {
        locationName: 'São Paulo',
        passTime: '08:00',
        tempC: 22,
        condition: 'Ensolarado',
        rainProb: 10,
        windKmH: 12
      },
      {
        locationName: 'Campos do Jordão',
        passTime: '11:15',
        tempC: 17,
        condition: 'Parcialmente Nublado',
        rainProb: 15,
        windKmH: 14
      }
    ],
    hasRainRisk: false,
    peopleCount: 1,
    vehicleGroupType: 'single_vehicle',
    groupVehiclesCount: 1,
    participants: [{ id: 'p1', name: 'Diego Mendes' }],
    splitExpenses: false,
    foodCostPerPerson: 65,
    fuelPricePerLiter: 5.89,
    estimatedFuelLiters: 6.56,
    estimatedFuelCost: 38.64,
    knownTollsCost: 14.80,
    totalFoodCost: 65.00,
    totalEstimatedCost: 118.44,
    costPerPerson: 118.44,
    status: 'completed',
    createdAt: '2026-08-25T08:00:00Z',
    completedAt: '2026-08-25T17:30:00Z',
    actualDistanceKm: 185,
    actualTraveledVerifiedGps: true,
    userRating: 5,
    userReview: 'Estrada fantástica com asfalto impecável na SP-123!'
  },
  {
    id: 'trip-comp-2',
    title: 'Bate-Volta Serra do Mar & Santos',
    originName: 'São Paulo - SP',
    originCoords: [-23.5505, -46.6333],
    destinationName: 'Santos - SP',
    destinationCoords: [-23.9618, -46.3322],
    modality: 'rapida',
    returnModality: 'rapida',
    isCircular: false,
    distanceKm: 85,
    durationMinutes: 75,
    vehicleId: 'veh-car-1',
    routePath: [
      [-23.5505, -46.6333],
      [-23.7500, -46.5500],
      [-23.9618, -46.3322]
    ],
    stops: [],
    weatherPoints: [],
    hasRainRisk: false,
    peopleCount: 4,
    vehicleGroupType: 'single_vehicle',
    groupVehiclesCount: 1,
    participants: [
      { id: 'p1', name: 'Diego' },
      { id: 'p2', name: 'Mariana' },
      { id: 'p3', name: 'Lucas' },
      { id: 'p4', name: 'Beatriz' }
    ],
    splitExpenses: true,
    foodCostPerPerson: 50,
    fuelPricePerLiter: 5.89,
    estimatedFuelLiters: 5.59,
    estimatedFuelCost: 32.93,
    knownTollsCost: 33.80,
    totalFoodCost: 200.00,
    totalEstimatedCost: 266.73,
    costPerPerson: 66.68,
    status: 'completed',
    createdAt: '2026-09-12T09:00:00Z',
    completedAt: '2026-09-12T18:00:00Z',
    actualDistanceKm: 85,
    actualTraveledVerifiedGps: false // manual entry
  }
];

export const storageService = {
  // VEHICLES
  getVehicles(): Vehicle[] {
    const raw = localStorage.getItem(STORAGE_KEYS.VEHICLES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(INITIAL_VEHICLES));
      return INITIAL_VEHICLES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_VEHICLES;
    }
  },

  saveVehicles(vehicles: Vehicle[]) {
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  },

  getSelectedVehicleId(): string {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_VEHICLE_ID);
    if (saved) return saved;
    const vehicles = this.getVehicles();
    const defaultVeh = vehicles.find(v => v.isDefault) || vehicles[0];
    const id = defaultVeh ? defaultVeh.id : '';
    if (id) localStorage.setItem(STORAGE_KEYS.SELECTED_VEHICLE_ID, id);
    return id;
  },

  setSelectedVehicleId(id: string) {
    localStorage.setItem(STORAGE_KEYS.SELECTED_VEHICLE_ID, id);
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
    if (this.getSelectedVehicleId() === id && vehicles.length > 0) {
      this.setSelectedVehicleId(vehicles[0].id);
    }
  },

  // FUEL LOGS & CONSUMPTION CALCULATION
  getFuelLogs(vehicleId?: string): FuelLog[] {
    const raw = localStorage.getItem(STORAGE_KEYS.FUEL_LOGS);
    let logs: FuelLog[] = [];
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.FUEL_LOGS, JSON.stringify(INITIAL_FUEL_LOGS));
      logs = INITIAL_FUEL_LOGS;
    } else {
      try {
        logs = JSON.parse(raw);
      } catch {
        logs = INITIAL_FUEL_LOGS;
      }
    }
    if (vehicleId) {
      return logs.filter(l => l.vehicleId === vehicleId);
    }
    return logs;
  },

  saveFuelLogs(logs: FuelLog[]) {
    localStorage.setItem(STORAGE_KEYS.FUEL_LOGS, JSON.stringify(logs));
  },

  addFuelLog(log: FuelLog): { observedAverage?: number } {
    const logs = this.getFuelLogs();
    logs.push(log);
    logs.sort((a, b) => a.odometerKm - b.odometerKm);
    this.saveFuelLogs(logs);

    // Calculate real observed consumption if there are consecutive full-tank refills
    const vehicleLogs = logs.filter(l => l.vehicleId === log.vehicleId && l.fullTank);
    let observedAvg: number | undefined = undefined;

    if (vehicleLogs.length >= 2) {
      let totalDistance = 0;
      let totalLiters = 0;
      for (let i = 1; i < vehicleLogs.length; i++) {
        const deltaKm = vehicleLogs[i].odometerKm - vehicleLogs[i - 1].odometerKm;
        const liters = vehicleLogs[i].liters;
        if (deltaKm > 0 && liters > 0) {
          totalDistance += deltaKm;
          totalLiters += liters;
        }
      }
      if (totalLiters > 0 && totalDistance > 0) {
        observedAvg = parseFloat((totalDistance / totalLiters).toFixed(2));
        // Update vehicle with this observed average
        const vehicles = this.getVehicles();
        const vIdx = vehicles.findIndex(v => v.id === log.vehicleId);
        if (vIdx >= 0) {
          vehicles[vIdx].consumption.observedAverage = observedAvg;
          // By requirement #5: Prioritize observed consumption when there is sufficient data
          vehicles[vIdx].consumption.userConfigured = observedAvg;
          this.saveVehicles(vehicles);
        }
      }
    }

    return { observedAverage: observedAvg };
  },

  // TRAVELER PROFILE & TIERS
  getProfile(): TravelerProfile {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(INITIAL_PROFILE));
      return INITIAL_PROFILE;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_PROFILE;
    }
  },

  saveProfile(profile: TravelerProfile) {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  },

  getAchievements(): Achievement[] {
    const raw = localStorage.getItem('rdv_achievements_v1');
    if (!raw) {
      localStorage.setItem('rdv_achievements_v1', JSON.stringify(INITIAL_ACHIEVEMENTS));
      return INITIAL_ACHIEVEMENTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_ACHIEVEMENTS;
    }
  },

  saveAchievements(achievements: Achievement[]) {
    localStorage.setItem('rdv_achievements_v1', JSON.stringify(achievements));
  },

  // Calculate traveler tier:
  // Bronze: 0 to 499 km
  // Prata: 500 to 1,999 km
  // Ouro: 2,000 to 9,999 km
  // Diamante: >= 10,000 km
  // Rule: Only actually completed trips (verified GPS + reported manual) count towards accumulated km.
  calculateTier(totalKm: number): {
    tier: TravelerTier;
    nextTier: TravelerTier | null;
    currentKmInTier: number;
    neededKmForNextTier: number;
    progressPercent: number;
    thresholdMin: number;
    thresholdMax: number;
  } {
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
    const raw = localStorage.getItem(STORAGE_KEYS.TRIPS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(INITIAL_TRIPS));
      return INITIAL_TRIPS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_TRIPS;
    }
  },

  saveTrips(trips: TripPlan[]) {
    localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
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
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setActiveTrip(trip: TripPlan | null) {
    if (trip) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP, JSON.stringify(trip));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP);
    }
  },

  // COMPLETE A TRIP AND UPDATE PROFILE, VEHICLE & ACHIEVEMENTS (Requirement #7)
  completeTrip(tripId: string, actualDistanceKm: number, verifiedByGps: boolean): {
    updatedProfile: TravelerProfile;
    newAchievementsUnlocked: Achievement[];
  } {
    const trips = this.getTrips();
    const tripIdx = trips.findIndex(t => t.id === tripId);
    let trip = tripIdx >= 0 ? trips[tripIdx] : null;

    if (!trip) {
      // If it was only an active transient trip
      trip = this.getActiveTrip();
    }

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
    const totalKm = profile.verifiedGpsKm + profile.manualKm;

    achievements.forEach(ach => {
      if (ach.unlockedAt) return; // already unlocked

      let shouldUnlock = false;
      if (ach.id === 'ach-first-trip' && profile.completedTripsCount >= 1) {
        ach.progress = profile.completedTripsCount;
        shouldUnlock = true;
      } else if (ach.id === 'ach-100km' && actualDistanceKm >= 100) {
        ach.progress = actualDistanceKm;
        shouldUnlock = true;
      } else if (ach.id === 'ach-500km' && actualDistanceKm >= 500) {
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

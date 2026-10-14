import { 
  TripPlan, 
  Vehicle, 
  RouteModality, 
  RouteStop, 
  WeatherPoint 
} from '../types';

export interface RouteOptionCalculated {
  modality: RouteModality;
  title: string;
  badge: string;
  description: string;
  distanceKm: number;
  durationMinutes: number;
  stopsCount: number;
  fuelLiters: number;
  fuelCost: number;
  tollsCost: number;
  totalFoodCost: number;
  totalCost: number;
  costPerPerson: number;
  scenicQualityStars: number;
  hasRainRisk: boolean;
  weatherSummary: string;
  routePath: [number, number][];
  stops: RouteStop[];
  weatherPoints: WeatherPoint[];
  capacityWarning?: string;
  explanation: string;
}

export interface RoutePlanningInput {
  originName: string;
  originCoords: [number, number];
  destinationName: string;
  destinationCoords: [number, number];
  vehicle: Vehicle;
  peopleCount: number;
  vehicleGroupType: 'single_vehicle' | 'multi_vehicle';
  groupVehiclesCount: number;
  splitExpenses: boolean;
  foodCostPerPerson: number;
  fuelPricePerLiter: number;
  returnModality: 'rapida' | 'turistica' | 'economica' | 'auto';
  isCircular?: boolean;
}

// Distance approximation in km
function calculateEuclideanDistanceKm(c1: [number, number], c2: [number, number]): number {
  const R = 6371; // Earth radius in km
  const dLat = ((c2[0] - c1[0]) * Math.PI) / 180;
  const dLon = ((c2[1] - c1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1[0] * Math.PI) / 180) *
      Math.cos((c2[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function generateRouteAlternatives(input: RoutePlanningInput): RouteOptionCalculated[] {
  const {
    originCoords,
    destinationCoords,
    vehicle,
    peopleCount,
    vehicleGroupType,
    groupVehiclesCount,
    splitExpenses,
    foodCostPerPerson,
    fuelPricePerLiter,
    isCircular
  } = input;

  const straightKm = calculateEuclideanDistanceKm(originCoords, destinationCoords);
  // Real road winding factor is usually 1.25x to 1.6x straight line in Brazil
  const baseRoadKm = Math.max(25, Math.round(straightKm * 1.3));

  // Passenger capacity validation
  let capacityWarning: string | undefined;
  if (vehicleGroupType === 'single_vehicle') {
    if (vehicle.type === 'motorcycle' && peopleCount > 2) {
      capacityWarning = `Atenção: A motocicleta ${vehicle.model} comporta no máximo 2 pessoas. Para ${peopleCount} pessoas, considere selecionar comboio com mais veículos.`;
    } else if (vehicle.type === 'car' && peopleCount > vehicle.maxPassengers) {
      capacityWarning = `Atenção: O veículo comporta ${vehicle.maxPassengers} passageiros, mas o grupo possui ${peopleCount} pessoas.`;
    }
  }

  // Modality multiplier factors
  const modalities: {
    modality: RouteModality;
    title: string;
    badge: string;
    description: string;
    kmFactor: number;
    timeFactor: number; // minutes per km
    tollFactor: number;
    scenicStars: number;
    stops: RouteStop[];
    rainRisk: boolean;
    explanation: string;
  }[] = [
    {
      modality: 'rapida',
      title: 'Rota Rápida',
      badge: 'Menor Tempo',
      description: 'Prioriza rodovias duplicadas de fluxo veloz para chegar o quanto antes.',
      kmFactor: 1.0,
      timeFactor: 1.05, // ~60-90 km/h average
      tollFactor: 1.0,
      scenicStars: 3,
      stops: [
        {
          id: 'stop-rap-1',
          name: 'Posto RodoRede 24h & Conveniência',
          category: 'posto',
          lat: (originCoords[0] + destinationCoords[0]) / 2,
          lng: (originCoords[1] + destinationCoords[1]) / 2,
          description: 'Abastecimento expresso, sanitários limpos e café rápido.',
          recommendedMinutes: 15,
          rating: 4.6,
          estimatedArrivalHour: '09:15'
        }
      ],
      rainRisk: false,
      explanation: 'Menor tempo de deslocamento por pistas principais, sem desvios secundários.'
    },
    {
      modality: 'panoramica',
      title: 'Rota Panorâmica',
      badge: 'Cênica & Serrana',
      description: 'Estradas cênicas, curvas suaves, mirantes e vegetação exuberante.',
      kmFactor: 1.22,
      timeFactor: 1.45,
      tollFactor: 0.6,
      scenicStars: 5,
      stops: [
        {
          id: 'stop-pan-1',
          name: 'Mirante dos Vales & Deck Panorâmico',
          category: 'mirante',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.45 + 0.04,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.45 - 0.05,
          description: 'Ponto privilegiado para contemplar a serra e tirar fotos.',
          recommendedMinutes: 25,
          rating: 4.9,
          estimatedArrivalHour: '09:40'
        },
        {
          id: 'stop-pan-2',
          name: 'Curva das Hortênsias & Cascata',
          category: 'parque',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.78 + 0.02,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.78 + 0.03,
          description: 'Trecho arborizado histórico com águas límpidas.',
          recommendedMinutes: 20,
          rating: 4.8,
          estimatedArrivalHour: '10:45'
        }
      ],
      rainRisk: true,
      explanation: 'Passa por serras e rodovias cênicas com mirantes deslumbrantes.'
    },
    {
      modality: 'turistica',
      title: 'Rota Turística',
      badge: 'História & Cultura',
      description: 'Atravessa centros históricos, casarios coloniais, praças e igrejas centenárias.',
      kmFactor: 1.28,
      timeFactor: 1.6,
      tollFactor: 0.5,
      scenicStars: 5,
      stops: [
        {
          id: 'stop-tur-1',
          name: 'Vila Histórica & Marco Colonial',
          category: 'cidade_historica',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.35 - 0.03,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.35 + 0.04,
          description: 'Igreja barroca e calçamento de pedras preservado do século XVIII.',
          recommendedMinutes: 45,
          rating: 4.8,
          estimatedArrivalHour: '09:30'
        },
        {
          id: 'stop-tur-2',
          name: 'Museu Ferroviário Regional',
          category: 'monumento',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.7 + 0.02,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.7 - 0.02,
          description: 'Locomotiva histórica e artesanato típico da região.',
          recommendedMinutes: 30,
          rating: 4.7,
          estimatedArrivalHour: '11:00'
        }
      ],
      rainRisk: false,
      explanation: 'Paradas culturais ricas em patrimônio histórico e monumentos.'
    },
    {
      modality: 'gastronomica',
      title: 'Rota Gastronômica',
      badge: 'Sabores Regionais',
      description: 'Focada em restaurantes de comida caseira, cafés artesanais e queijarias.',
      kmFactor: 1.18,
      timeFactor: 1.5,
      tollFactor: 0.7,
      scenicStars: 4,
      stops: [
        {
          id: 'stop-gas-1',
          name: 'Empório Rural & Queijaria Artesanal',
          category: 'restaurante',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.4 + 0.02,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.4 + 0.03,
          description: 'Degustação de queijos meia cura artesanais e doces no tacho.',
          recommendedMinutes: 40,
          rating: 4.9,
          estimatedArrivalHour: '09:50'
        },
        {
          id: 'stop-gas-2',
          name: 'Restaurante Fogão à Lenha da Serra',
          category: 'restaurante',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.75 - 0.02,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.75 - 0.01,
          description: 'Gastronomia típica do interior com vista para a serra.',
          recommendedMinutes: 60,
          rating: 4.8,
          estimatedArrivalHour: '12:15'
        }
      ],
      rainRisk: false,
      explanation: 'Combina paradas para degustação e culinária típica regional.'
    },
    {
      modality: 'economica',
      title: 'Rota Econômica',
      badge: 'Menor Custo',
      description: 'Prioriza traçados sem pedágios ou com tarifas reduzidas e velocidade constante.',
      kmFactor: 1.08,
      timeFactor: 1.25,
      tollFactor: 0.25, // minimal tolls
      scenicStars: 3,
      stops: [
        {
          id: 'stop-eco-1',
          name: 'Parada do Pão de Queijo & Combustível Barato',
          category: 'posto',
          lat: (originCoords[0] + destinationCoords[0]) / 2 - 0.02,
          lng: (originCoords[1] + destinationCoords[1]) / 2 + 0.02,
          description: 'Preços de combustível competitivos e lanche econômico.',
          recommendedMinutes: 15,
          rating: 4.3,
          estimatedArrivalHour: '09:20'
        }
      ],
      rainRisk: false,
      explanation: 'Economiza até 75% em tarifas de pedágio mantendo consumo eficiente.'
    },
    {
      modality: 'equilibrada',
      title: 'Rota Equilibrada',
      badge: 'Recomendada',
      description: 'Equilíbrio ideal entre boas paisagens, asfalto seguro, tempo e custo razoável.',
      kmFactor: 1.12,
      timeFactor: 1.28,
      tollFactor: 0.8,
      scenicStars: 4,
      stops: [
        {
          id: 'stop-eq-1',
          name: 'Mirante dos Pinhais & Café da Montanha',
          category: 'mirante',
          lat: originCoords[0] + (destinationCoords[0] - originCoords[0]) * 0.5 + 0.03,
          lng: originCoords[1] + (destinationCoords[1] - originCoords[1]) * 0.5 - 0.02,
          description: 'Ótima parada para esticar as pernas com bom café e vista bonita.',
          recommendedMinutes: 25,
          rating: 4.8,
          estimatedArrivalHour: '10:00'
        }
      ],
      rainRisk: false,
      explanation: 'Combina o melhor tempo com uma parada turística imperdível sem grandes desvios.'
    }
  ];

  // Effective vehicle consumption (km/l)
  const kmPerLiter = vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage || 14.0;
  
  // Toll base calculation for SP region
  // Moto is often R$ 0 or 50% discount; cars standard
  const baseTollPer100Km = vehicle.type === 'motorcycle' ? 8.5 : 18.0;

  return modalities.map(m => {
    const distKm = Math.round(baseRoadKm * m.kmFactor);
    const durationMin = Math.round((distKm / 75) * 60 * m.timeFactor) + 
      m.stops.reduce((acc, s) => acc + s.recommendedMinutes, 0);

    // Number of vehicles in convoy
    const vehiclesCount = vehicleGroupType === 'multi_vehicle' ? Math.max(1, groupVehiclesCount) : 1;

    // Fuel calculation
    const fuelLiters = parseFloat(((distKm / kmPerLiter) * vehiclesCount).toFixed(2));
    const fuelCost = parseFloat((distKm / kmPerLiter * vehiclesCount * fuelPricePerLiter).toFixed(2));

    // Toll calculation
    const tollsCost = parseFloat((((distKm / 100) * baseTollPer100Km * m.tollFactor) * vehiclesCount).toFixed(2));

    // Food calculation based on people count
    const totalFood = parseFloat((peopleCount * foodCostPerPerson).toFixed(2));

    // Total cost
    const totalCost = parseFloat((fuelCost + tollsCost + totalFood).toFixed(2));
    const costPerPerson = splitExpenses ? parseFloat((totalCost / Math.max(1, peopleCount)).toFixed(2)) : totalCost;

    // Construct realistic intermediate polyline coordinates
    const routePath: [number, number][] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Linear interpolation with curvature depending on modality
      let lat = originCoords[0] + (destinationCoords[0] - originCoords[0]) * t;
      let lng = originCoords[1] + (destinationCoords[1] - originCoords[1]) * t;
      
      if (i > 0 && i < steps) {
        // add scenic curvature
        const curve = Math.sin(t * Math.PI) * (m.kmFactor - 1.0) * 0.45;
        const perpLat = -(destinationCoords[1] - originCoords[1]);
        const perpLng = (destinationCoords[0] - originCoords[0]);
        lat += perpLat * curve;
        lng += perpLng * curve;
      }
      routePath.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
    }

    // Weather simulation along route
    const weatherPoints: WeatherPoint[] = [
      {
        locationName: input.originName.split(',')[0],
        passTime: '08:00',
        tempC: 22,
        condition: 'Ensolarado',
        rainProb: 10,
        windKmH: 12
      },
      {
        locationName: 'Trecho de Serra / Meio',
        passTime: '09:45',
        tempC: m.rainRisk ? 19 : 21,
        condition: m.rainRisk ? 'Chuva Fraca' : 'Parcialmente Nublado',
        rainProb: m.rainRisk ? 65 : 20,
        windKmH: m.rainRisk ? 28 : 15,
        warning: m.rainRisk && vehicle.type === 'motorcycle' 
          ? 'Alerta Piloto: Pista molhada prevista e rajadas de vento na serra. Reduza a velocidade.' 
          : undefined
      },
      {
        locationName: input.destinationName.split(',')[0],
        passTime: `${Math.floor(durationMin / 60) + 8}:${String(durationMin % 60).padStart(2, '0')}`,
        tempC: 24,
        condition: 'Ensolarado',
        rainProb: 15,
        windKmH: 14
      }
    ];

    const weatherSummary = m.rainRisk 
      ? 'Chuva leve prevista no trecho serrano às 09h45 (65% prob)' 
      : 'Tempo estável ao longo de todo o percurso (10% a 20% prob)';

    return {
      modality: m.modality,
      title: m.title,
      badge: m.badge,
      description: m.description,
      distanceKm: distKm,
      durationMinutes: durationMin,
      stopsCount: m.stops.length,
      fuelLiters,
      fuelCost,
      tollsCost,
      totalFoodCost: totalFood,
      totalCost,
      costPerPerson,
      scenicQualityStars: m.scenicStars,
      hasRainRisk: m.rainRisk,
      weatherSummary,
      routePath,
      stops: m.stops,
      weatherPoints,
      capacityWarning,
      explanation: m.explanation
    };
  });
}

export function getPlanningAlternatives(input: RoutePlanningInput, presetTrip?: TripPlan): RouteOptionCalculated[] {
  if (!presetTrip) return generateRouteAlternatives(input);
  const vehiclesCount = input.vehicleGroupType === 'multi_vehicle' ? Math.max(1, input.groupVehiclesCount) : 1;
  const consumption = input.vehicle.consumption.userConfigured || input.vehicle.consumption.referenceAverage || 15;
  const fuelLiters = Number((presetTrip.distanceKm / consumption * vehiclesCount).toFixed(2));
  const fuelCost = Number((presetTrip.distanceKm / consumption * vehiclesCount * input.fuelPricePerLiter).toFixed(2));
  const tollsCost = Number((presetTrip.knownTollsCost / Math.max(1, presetTrip.groupVehiclesCount) * vehiclesCount).toFixed(2));
  const totalFoodCost = input.peopleCount * input.foodCostPerPerson;
  const totalCost = Number((fuelCost + tollsCost + totalFoodCost).toFixed(2));
  const capacityWarning = input.vehicleGroupType === 'single_vehicle' && input.peopleCount > input.vehicle.maxPassengers
    ? `O veículo comporta ${input.vehicle.maxPassengers} pessoas, mas o grupo possui ${input.peopleCount}.` : undefined;
  return [{
    modality: presetTrip.modality,
    title: presetTrip.title,
    badge: presetTrip.isCircular ? 'Ida e volta' : 'Só ida',
    description: 'Mantém a distância, o tempo e as paradas do passeio que você escolheu.',
    distanceKm: presetTrip.distanceKm,
    durationMinutes: presetTrip.durationMinutes,
    stopsCount: presetTrip.stops.length,
    fuelLiters, fuelCost, tollsCost, totalFoodCost, totalCost,
    costPerPerson: input.splitExpenses ? Number((totalCost / Math.max(1, input.peopleCount)).toFixed(2)) : totalCost,
    scenicQualityStars: presetTrip.routingSource === 'OSRM' ? 0 : 4,
    hasRainRisk: presetTrip.hasRainRisk,
    weatherSummary: presetTrip.weatherSource ? `Previsão real · ${presetTrip.weatherSource}` : 'Previsão indisponível; consulte novamente antes de sair.',
    routePath: presetTrip.routePath,
    stops: presetTrip.stops,
    weatherPoints: presetTrip.weatherPoints,
    capacityWarning,
    explanation: presetTrip.routingSource ? 'Percurso calculado por vias reais com paradas verificáveis. A distância e a duração podem variar da preferência inicial.' : 'Roteiro ilustrativo do passeio selecionado. Distância e tempo preservados.'
  }];
}

export function buildPlannedTrip(input: RoutePlanningInput, option: RouteOptionCalculated, presetTrip?: TripPlan): TripPlan {
  return {
    id: presetTrip?.id || `trip-${Date.now()}`,
    title: presetTrip?.title || `${option.title}: ${input.originName} até ${input.destinationName}`,
    originName: input.originName,
    originCoords: input.originCoords,
    destinationName: input.destinationName,
    destinationCoords: input.destinationCoords,
    modality: option.modality,
    returnModality: input.returnModality,
    isCircular: presetTrip?.isCircular ?? false,
    distanceKm: option.distanceKm,
    durationMinutes: option.durationMinutes,
    vehicleId: input.vehicle.id,
    manualStops: presetTrip?.manualStops,
    acceptedSuggestions: presetTrip?.acceptedSuggestions,
    planningLimits: presetTrip?.planningLimits,
    waypointOrder: presetTrip?.waypointOrder,
    routingSource: presetTrip?.routingSource,
    tollsStatus: presetTrip?.tollsStatus,
    tolls: presetTrip?.tolls, weatherSource: presetTrip?.weatherSource, weatherUpdatedAt: presetTrip?.weatherUpdatedAt, departureAt: presetTrip?.departureAt,
    routeWarnings: presetTrip?.routeWarnings,
    routePath: option.routePath,
    stops: option.stops,
    weatherPoints: option.weatherPoints,
    hasRainRisk: option.hasRainRisk,
    peopleCount: input.peopleCount,
    vehicleGroupType: input.vehicleGroupType,
    groupVehiclesCount: input.groupVehiclesCount,
    participants: Array.from({ length: input.peopleCount }, (_, i) => ({ id: `p-${i + 1}`, name: i === 0 ? 'Você' : `Participante ${i + 1}` })),
    splitExpenses: input.splitExpenses,
    foodCostPerPerson: input.foodCostPerPerson,
    fuelPricePerLiter: input.fuelPricePerLiter,
    estimatedFuelLiters: option.fuelLiters,
    estimatedFuelCost: option.fuelCost,
    knownTollsCost: option.tollsCost,
    totalFoodCost: option.totalFoodCost,
    totalEstimatedCost: option.totalCost,
    costPerPerson: option.costPerPerson,
    capacityWarning: option.capacityWarning,
    status: 'planned',
    createdAt: presetTrip?.createdAt || new Date().toISOString()
  };
}

export interface TouristCircuitInput {
  mode: 'km' | 'hours';
  targetValue: number; // e.g. 50 (km) or 2.5 (hours)
  tripType?: 'round_trip' | 'one_way';
  departureTime?: string; // e.g. "08:30"
  originCoords?: [number, number];
  originName?: string;
  vehicle: Vehicle;
  peopleCount?: number;
  interests?: string[]; // e.g. ['panoramico', 'gastronomico']
}

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const parts = timeStr.split(':');
  let h = parseInt(parts[0], 10) || 8;
  let m = parseInt(parts[1], 10) || 0;
  m += minutesToAdd;
  h += Math.floor(m / 60);
  m = m % 60;
  h = h % 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateTouristCircuitByKmOrHours(input: TouristCircuitInput): TripPlan {
  const {
    mode,
    targetValue,
    tripType = 'round_trip',
    departureTime = '08:00',
    originCoords = [-23.5505, -46.6333],
    originName = 'São Paulo - SP (Partida)',
    vehicle,
    peopleCount = 1,
    interests = ['panoramico']
  } = input;

  const isRoundTrip = tripType === 'round_trip';

  // Compute target km and total duration
  let distanceKm: number;
  let durationMinutes: number;

  if (mode === 'km') {
    distanceKm = Math.max(15, Math.round(targetValue));
    // Avg ~65 km/h driving + ~35 min total scenic visits
    durationMinutes = Math.round((distanceKm / 65) * 60) + (isRoundTrip ? 35 : 20);
  } else {
    // mode === 'hours'
    durationMinutes = Math.max(45, Math.round(targetValue * 60));
    // assume 65 km/h driving for 75% of time + 25% visiting stops
    distanceKm = Math.max(20, Math.round(((durationMinutes * 0.75) / 60) * 65));
  }

  const startLat = originCoords[0];
  const startLng = originCoords[1];

  // Destination and stops determination
  let circuitTitle = '';
  let destinationName = '';
  let destinationCoords: [number, number] = [startLat, startLng];
  let stops: RouteStop[] = [];

  const timeStop1 = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.35));
  const timeStop2 = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.65));
  const timeArrival = addMinutesToTime(departureTime, durationMinutes);

  const isAllUnchecked = !interests || interests.length === 0;
  const includeGastronomy = isAllUnchecked || interests.includes('gastronomico');
  const includeHistory = isAllUnchecked || interests.includes('historico');
  const includeNature = isAllUnchecked || interests.includes('natureza');
  const includeMuseums = isAllUnchecked || interests.includes('museus') || interests.includes('cultura');
  const includePanoramic = isAllUnchecked || interests.includes('panoramico');

  if (isRoundTrip) {
    // 1. IDA E VOLTA (PASSEAR E VOLTAR) - Total distance encompasses the whole loop
    destinationName = `${originName} (Circuito Fechado Ida e Volta)`;
    destinationCoords = originCoords;

    const loopRadius = Math.max(0.04, (distanceKm / (2 * Math.PI)) / 111);

    if (isAllUnchecked) {
      // Quando todos os estilos estão desmarcados:
      // O app gera os pontos turísticos normais (Gastronomia, Museus, Parques, Cidades Históricas)
      // distribuídos proporcionalmente ao redor da localização da pessoa e do km selecionado
      circuitTitle = `Passear e Voltar: Circuito Turístico Completo (${distanceKm} km totais)`;
      
      const timeStopMuseum = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.25));
      const timeStopPark = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.50));
      const timeStopHistory = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.70));
      const timeStopGastro = addMinutesToTime(departureTime, Math.round(durationMinutes * 0.85));

      stops = [
        {
          id: 'stop-norm-park',
          name: distanceKm <= 50 ? 'Parque Municipal & Bosque das Alamedas' : 'Parque Estadual Ecológico & Cachoeira',
          category: 'parque',
          lat: parseFloat((startLat + loopRadius * 0.85).toFixed(4)),
          lng: parseFloat((startLng + loopRadius * 0.40).toFixed(4)),
          description: 'Parada ecológica em meio ao verde com trilhas acessíveis e lago para relaxar.',
          recommendedMinutes: 25,
          rating: 4.8,
          estimatedArrivalHour: timeStopPark
        },
        {
          id: 'stop-norm-hist',
          name: distanceKm <= 50 ? 'Praça Central Histórica & Matriz' : 'Centro Histórico & Casarões Tombados',
          category: 'cidade_historica',
          lat: parseFloat((startLat + loopRadius * 0.35).toFixed(4)),
          lng: parseFloat((startLng - loopRadius * 0.85).toFixed(4)),
          description: 'Arquitetura colonial, calçadão de paralelepípedos e marco histórico da região.',
          recommendedMinutes: 35,
          rating: 4.9,
          estimatedArrivalHour: timeStopHistory
        },
        {
          id: 'stop-norm-mus',
          name: distanceKm <= 50 ? 'Museu Histórico & Casa da Memória' : 'Museu Regional de Arte & Tradições',
          category: 'museu',
          lat: parseFloat((startLat - loopRadius * 0.70).toFixed(4)),
          lng: parseFloat((startLng - loopRadius * 0.50).toFixed(4)),
          description: 'Acervo cultural com memorial dos tropeiros, ferrovia e fundadores locais.',
          recommendedMinutes: 30,
          rating: 4.7,
          estimatedArrivalHour: timeStopMuseum
        },
        {
          id: 'stop-norm-gastro',
          name: distanceKm <= 50 ? 'Café Colonial & Quitutes de Fazenda' : 'Empório Gastronômico & Restaurante Típico',
          category: 'restaurante',
          lat: parseFloat((startLat - loopRadius * 0.45).toFixed(4)),
          lng: parseFloat((startLng + loopRadius * 0.70).toFixed(4)),
          description: 'Almoço no fogão a lenha, café artesanal passado na hora e doces regionais.',
          recommendedMinutes: 45,
          rating: 4.8,
          estimatedArrivalHour: timeStopGastro
        }
      ];
    } else if (distanceKm <= 50) {
      circuitTitle = `Passear e Voltar: Circuito Cantareira & Mirantes (${distanceKm} km totais)`;
      stops = [
        {
          id: 'stop-c1',
          name: includePanoramic ? 'Mirante da Serra da Cantareira' : 'Parque Horto Florestal',
          category: includePanoramic ? 'mirante' : 'parque',
          lat: startLat + 0.12,
          lng: startLng - 0.05,
          description: 'Ponto panorâmico com vista de 360° da serra e Mata Atlântica.',
          recommendedMinutes: 20,
          rating: 4.8,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-c2',
          name: includeGastronomy ? 'Café Artesanal do Bosque' : (includeNature ? 'Parque das Águas' : 'Memorial Histórico'),
          category: includeGastronomy ? 'restaurante' : (includeNature ? 'parque' : 'museu'),
          lat: startLat + 0.09,
          lng: startLng - 0.02,
          description: 'Parada para degustar café colonial e contemplar a natureza.',
          recommendedMinutes: 25,
          rating: 4.7,
          estimatedArrivalHour: timeStop2
        }
      ];
    } else if (distanceKm <= 120) {
      circuitTitle = `Passear e Voltar: Rota das Curvas & Vinhedos (${distanceKm} km totais)`;
      stops = [
        {
          id: 'stop-v1',
          name: includeHistory ? 'Vila Colonial de São Roque' : (includeGastronomy ? 'Estrada do Vinho & Parreirais' : 'Museu Ferroviário Central'),
          category: includeHistory ? 'cidade_historica' : (includeGastronomy ? 'restaurante' : 'museu'),
          lat: startLat + 0.02,
          lng: startLng - 0.45,
          description: 'Parreirais, cantinas históricas e gastronomia regional no caminho.',
          recommendedMinutes: 40,
          rating: 4.9,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-v2',
          name: includePanoramic ? 'Mirante do Morro do Saboó' : 'Parque Municipal Ecológico',
          category: includePanoramic ? 'mirante' : 'parque',
          lat: startLat + 0.08,
          lng: startLng - 0.38,
          description: 'Mirante a mais de 1.000m de altitude com visual incrível na serra.',
          recommendedMinutes: 25,
          rating: 4.8,
          estimatedArrivalHour: timeStop2
        }
      ];
    } else {
      circuitTitle = `Passear e Voltar: Grande Circuito Mantiqueira (${distanceKm} km totais)`;
      stops = [
        {
          id: 'stop-g1',
          name: includePanoramic ? 'Mirante Vista Chinesa da Mantiqueira' : 'Parque Estadual da Mantiqueira',
          category: includePanoramic ? 'mirante' : 'parque',
          lat: startLat + 0.78,
          lng: startLng + 1.05,
          description: 'Vista deslumbrante de todo o Vale na subida da serra cênica.',
          recommendedMinutes: 30,
          rating: 4.9,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-g2',
          name: includeGastronomy ? 'Empório Rural & Queijos da Montanha' : (includeHistory ? 'Santo Antônio do Pinhal Histórico' : 'Museu Felícia Leirner'),
          category: includeGastronomy ? 'restaurante' : (includeHistory ? 'cidade_historica' : 'museu'),
          lat: startLat + 0.72,
          lng: startLng + 0.85,
          description: 'Gastronomia artesanal e praça florida antes da estrada de volta.',
          recommendedMinutes: 45,
          rating: 4.8,
          estimatedArrivalHour: timeStop2
        }
      ];
    }
  } else {
    // 2. SÓ IDA - The target distance is the one-way trip to a scenic tourist destination
    if (isAllUnchecked) {
      // Quando todos os estilos estão desmarcados em SÓ IDA:
      if (distanceKm <= 70) {
        destinationName = 'Paranapiacaba (Vila Histórica Inglesa)';
        destinationCoords = [startLat - 0.22, startLng + 0.35];
        circuitTitle = `Só Ida: Roteiro Turístico até Paranapiacaba (${distanceKm} km)`;
        stops = [
          {
            id: 'stop-one-park',
            name: 'Parque Natural Municipal Nascentes',
            category: 'parque',
            lat: startLat - 0.10,
            lng: startLng + 0.15,
            description: 'Parque preservado da Mata Atlântica com trilhas ecológicas.',
            recommendedMinutes: 25,
            rating: 4.8,
            estimatedArrivalHour: timeStop1
          },
          {
            id: 'stop-one-mus',
            name: 'Museu Ferroviário & Funicular Histórico',
            category: 'museu',
            lat: startLat - 0.18,
            lng: startLng + 0.28,
            description: 'Acervo e maquinários a vapor do século XIX da antiga ferrovia.',
            recommendedMinutes: 30,
            rating: 4.7,
            estimatedArrivalHour: timeStop2
          },
          {
            id: 'stop-one-gastro',
            name: 'Empório do Cambuci & Gastronomia Local',
            category: 'restaurante',
            lat: startLat - 0.21,
            lng: startLng + 0.33,
            description: 'Culinária tradicional com receitas típicas de cambuci e doces artesanais.',
            recommendedMinutes: 40,
            rating: 4.8,
            estimatedArrivalHour: addMinutesToTime(departureTime, Math.round(durationMinutes * 0.85))
          },
          {
            id: 'stop-one-hist',
            name: 'Centro Histórico & Torre do Relógio Big Ben',
            category: 'cidade_historica',
            lat: startLat - 0.22,
            lng: startLng + 0.35,
            description: 'Chegada na charmosa vila ferroviária tombada pelo patrimônio histórico.',
            recommendedMinutes: 45,
            rating: 4.9,
            estimatedArrivalHour: timeArrival
          }
        ];
      } else if (distanceKm <= 130) {
        destinationName = 'Santos & Centro Histórico do Café';
        destinationCoords = [-23.9618, -46.3322];
        circuitTitle = `Só Ida: Roteiro Turístico até Santos (${distanceKm} km)`;
        stops = [
          {
            id: 'stop-one-park',
            name: 'Parque Ecológico da Estrada Velha',
            category: 'parque',
            lat: -23.7500,
            lng: -46.5000,
            description: 'Trilha histórica da calçada do Lorena e cachoeiras da serra.',
            recommendedMinutes: 30,
            rating: 4.8,
            estimatedArrivalHour: timeStop1
          },
          {
            id: 'stop-one-mus',
            name: 'Museu dos Monumentos da Serra',
            category: 'museu',
            lat: -23.8200,
            lng: -46.4200,
            description: 'Monumentos comemorativos da independência e mirante de contemplação.',
            recommendedMinutes: 25,
            rating: 4.7,
            estimatedArrivalHour: timeStop2
          },
          {
            id: 'stop-one-gastro',
            name: 'Restaurante & Mercado de Peixes',
            category: 'restaurante',
            lat: -23.9400,
            lng: -46.3300,
            description: 'Gastronomia litorânea e frutos do mar frescos tradicionais.',
            recommendedMinutes: 45,
            rating: 4.8,
            estimatedArrivalHour: addMinutesToTime(departureTime, Math.round(durationMinutes * 0.85))
          },
          {
            id: 'stop-one-hist',
            name: 'Centro Histórico & Museu da Bolsa do Café',
            category: 'cidade_historica',
            lat: -23.9350,
            lng: -46.3280,
            description: 'Calçadão colonial preservado, bondinho histórico e degustação dos melhores cafés.',
            recommendedMinutes: 45,
            rating: 4.9,
            estimatedArrivalHour: timeArrival
          }
        ];
      } else {
        destinationName = 'Campos do Jordão & Serra da Mantiqueira';
        destinationCoords = [-22.7394, -45.5914];
        circuitTitle = `Só Ida: Roteiro Turístico até Campos do Jordão (${distanceKm} km)`;
        stops = [
          {
            id: 'stop-one-park',
            name: 'Parque Estadual Horto Florestal',
            category: 'parque',
            lat: -22.7100,
            lng: -45.4800,
            description: 'Maior reserva de araucárias de SP com pontes pênseis e riachos de montanha.',
            recommendedMinutes: 35,
            rating: 4.9,
            estimatedArrivalHour: timeStop1
          },
          {
            id: 'stop-one-mus',
            name: 'Museu Felícia Leirner & Auditório Cláudio Santoro',
            category: 'museu',
            lat: -22.7300,
            lng: -45.6100,
            description: 'Esculturas a céu aberto integradas com a vista espetacular da Pedra do Baú.',
            recommendedMinutes: 40,
            rating: 4.9,
            estimatedArrivalHour: timeStop2
          },
          {
            id: 'stop-one-gastro',
            name: 'Restaurante Tradicional das Trutas & Fondues',
            category: 'restaurante',
            lat: -22.7200,
            lng: -45.5800,
            description: 'Culinária de montanha com chocolates artesanais, queijos e lareira.',
            recommendedMinutes: 50,
            rating: 4.8,
            estimatedArrivalHour: addMinutesToTime(departureTime, Math.round(durationMinutes * 0.85))
          },
          {
            id: 'stop-one-hist',
            name: 'Vila Capivari & Centro Histórico da Montanha',
            category: 'cidade_historica',
            lat: -22.7394,
            lng: -45.5914,
            description: 'Charme da arquitetura alpina, bondinho urbano e praça principal de eventos.',
            recommendedMinutes: 45,
            rating: 4.9,
            estimatedArrivalHour: timeArrival
          }
        ];
      }
    } else if (distanceKm <= 60) {
      destinationName = 'Paranapiacaba (Vila Histórica Inglesa)';
      destinationCoords = [startLat - 0.22, startLng + 0.35];
      circuitTitle = `Só Ida: Passeio Histórico até Paranapiacaba (${distanceKm} km)`;
      stops = [
        {
          id: 'stop-one-1',
          name: includePanoramic ? 'Mirante do Pico do Olho D’Água' : 'Parque das Nascentes',
          category: includePanoramic ? 'mirante' : 'parque',
          lat: startLat - 0.12,
          lng: startLng + 0.18,
          description: 'Ponto cênico no caminho da serra com vista para a neblina matinal.',
          recommendedMinutes: 20,
          rating: 4.8,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-one-2',
          name: includeHistory ? 'Centro Histórico & Torre do Relógio' : (includeGastronomy ? 'Empório do Cambuci' : 'Museu Ferroviário'),
          category: includeHistory ? 'cidade_historica' : (includeGastronomy ? 'restaurante' : 'museu'),
          lat: startLat - 0.22,
          lng: startLng + 0.35,
          description: 'Chegada na charmosa vila ferroviária do século XIX.',
          recommendedMinutes: 40,
          rating: 4.9,
          estimatedArrivalHour: timeArrival
        }
      ];
    } else if (distanceKm <= 120) {
      destinationName = 'Santos & Orla da Praia';
      destinationCoords = [-23.9618, -46.3322];
      circuitTitle = `Só Ida: Descida da Serra até Santos (${distanceKm} km)`;
      stops = [
        {
          id: 'stop-one-1',
          name: includePanoramic ? 'Monumento do Pouso Paranapiacaba' : 'Parque da Estrada Velha',
          category: includePanoramic ? 'monumento' : 'parque',
          lat: -23.7500,
          lng: -46.5000,
          description: 'Mirante histórico da antiga Estrada Velha de Santos.',
          recommendedMinutes: 25,
          rating: 4.8,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-one-2',
          name: includeMuseums ? 'Centro Histórico & Museu do Café' : (includeGastronomy ? 'Restaurante & Frutos do Mar' : 'Vila Histórica de Santos'),
          category: includeMuseums ? 'museu' : (includeGastronomy ? 'restaurante' : 'cidade_historica'),
          lat: -23.9350,
          lng: -46.3280,
          description: 'Degustação dos melhores grãos e calçadão histórico.',
          recommendedMinutes: 45,
          rating: 4.9,
          estimatedArrivalHour: timeArrival
        }
      ];
    } else if (distanceKm <= 200) {
      destinationName = 'Campos do Jordão (Mantiqueira)';
      destinationCoords = [-22.7394, -45.5914];
      circuitTitle = `Só Ida: Rota Serrana para Campos do Jordão (${distanceKm} km)`;
      stops = [
        {
          id: 'stop-one-1',
          name: 'Posto Graal 125 (Parada Técnica)',
          category: 'posto',
          lat: -23.2237,
          lng: -45.9009,
          description: 'Café da manhã dos viajantes e abastecimento.',
          recommendedMinutes: 20,
          rating: 4.6,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-one-2',
          name: includePanoramic ? 'Mirante da Vista Chinesa' : (includeMuseums ? 'Museu Felícia Leirner' : 'Vila Capivari Histórica'),
          category: includePanoramic ? 'mirante' : (includeMuseums ? 'museu' : 'cidade_historica'),
          lat: -22.7562,
          lng: -45.5781,
          description: 'Parada fotográfica espetacular na subida da SP-123.',
          recommendedMinutes: 25,
          rating: 4.9,
          estimatedArrivalHour: timeStop2
        }
      ];
    } else {
      destinationName = 'Paraty & Costa Verde';
      destinationCoords = [-23.2178, -44.7131];
      circuitTitle = `Só Ida: Estrada Real até Paraty Colonial (${distanceKm} km)`;
      stops = [
        {
          id: 'stop-one-1',
          name: 'Lavandário de Cunha',
          category: 'parque',
          lat: -23.0750,
          lng: -44.9500,
          description: 'Campos de lavanda floridos com café na montanha.',
          recommendedMinutes: 35,
          rating: 4.9,
          estimatedArrivalHour: timeStop1
        },
        {
          id: 'stop-one-2',
          name: includeHistory ? 'Centro Histórico Tombado de Paraty' : 'Parque Nacional da Serra da Bocaina',
          category: includeHistory ? 'cidade_historica' : 'mirante',
          lat: -23.1500,
          lng: -44.8200,
          description: 'Caminho preservado de descida colonial para o litoral.',
          recommendedMinutes: 30,
          rating: 4.8,
          estimatedArrivalHour: timeStop2
        }
      ];
    }
  }

  // Construct route polyline
  const routePath: [number, number][] = [];
  const pointsCount = 18;

  if (isRoundTrip) {
    // Closed circular loop
    const loopRadius = (distanceKm / (2 * Math.PI)) / 111;
    for (let i = 0; i <= pointsCount; i++) {
      const angle = (i / pointsCount) * 2 * Math.PI;
      const r = loopRadius * (0.8 + 0.35 * Math.sin(angle * 2));
      const lat = startLat + r * Math.sin(angle) * 1.15;
      const lng = startLng + r * Math.cos(angle);
      routePath.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
    }
    routePath[0] = [startLat, startLng];
    routePath[routePath.length - 1] = [startLat, startLng];
  } else {
    // One way line to destinationCoords
    for (let i = 0; i <= pointsCount; i++) {
      const t = i / pointsCount;
      let lat = startLat + (destinationCoords[0] - startLat) * t;
      let lng = startLng + (destinationCoords[1] - startLng) * t;
      if (i > 0 && i < pointsCount) {
        // scenic curvature
        const curve = Math.sin(t * Math.PI) * 0.06;
        lat += curve;
        lng += curve * 0.4;
      }
      routePath.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
    }
  }

  // Fuel calculation
  const kmPerL = vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage || 15.0;
  const fuelLiters = parseFloat((distanceKm / kmPerL).toFixed(2));
  const fuelPricePerLiter = 5.89;
  const fuelCost = parseFloat((fuelLiters * fuelPricePerLiter).toFixed(2));
  const tollsCost = vehicle.type === 'motorcycle' ? 8.5 : 18.0;
  const totalFood = peopleCount * 50;
  const totalCost = parseFloat((fuelCost + tollsCost + totalFood).toFixed(2));

  return {
    id: `tour-loop-${Date.now()}`,
    title: circuitTitle,
    originName: originName,
    originCoords: originCoords,
    destinationName: destinationName,
    destinationCoords: destinationCoords,
    modality: 'panoramica',
    returnModality: isRoundTrip ? 'auto' : 'rapida',
    isCircular: isRoundTrip,
    distanceKm,
    durationMinutes,
    vehicleId: vehicle.id,
    routePath,
    stops,
    weatherPoints: [
      {
        locationName: originName.split('(')[0].trim(),
        passTime: departureTime,
        tempC: 22,
        condition: 'Ensolarado',
        rainProb: 10,
        windKmH: 12
      },
      {
        locationName: 'Ponto Médio / Mirante',
        passTime: timeStop1,
        tempC: 20,
        condition: 'Parcialmente Nublado',
        rainProb: 15,
        windKmH: 16
      },
      {
        locationName: isRoundTrip ? 'Retorno / Chegada' : destinationName.split('(')[0].trim(),
        passTime: timeArrival,
        tempC: 23,
        condition: 'Ensolarado',
        rainProb: 10,
        windKmH: 14
      }
    ],
    hasRainRisk: false,
    peopleCount,
    vehicleGroupType: 'single_vehicle',
    groupVehiclesCount: 1,
    participants: [{ id: 'p1', name: 'Você' }],
    splitExpenses: false,
    foodCostPerPerson: 50,
    fuelPricePerLiter,
    estimatedFuelLiters: fuelLiters,
    estimatedFuelCost: fuelCost,
    knownTollsCost: tollsCost,
    totalFoodCost: totalFood,
    totalEstimatedCost: totalCost,
    costPerPerson: totalCost,
    status: 'planned',
    createdAt: new Date().toISOString()
  };
}




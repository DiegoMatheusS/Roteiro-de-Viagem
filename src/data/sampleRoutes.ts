import { CommunityRoute, RouteStop, WeatherPoint } from '../types';

export interface PresetDestination {
  name: string;
  subtitle: string;
  state: string;
  coords: [number, number];
  distanceKmFromSP: number;
  highlight: string;
}

export const PRESET_DESTINATIONS: PresetDestination[] = [
  {
    name: 'Campos do Jordão',
    subtitle: 'Serra da Mantiqueira',
    state: 'SP',
    coords: [-22.7394, -45.5914],
    distanceKmFromSP: 172,
    highlight: 'Curvas cênicas da SP-123 e clima alpino'
  },
  {
    name: 'Paraty / Cunha',
    subtitle: 'Estrada Real & Costa Verde',
    state: 'RJ/SP',
    coords: [-23.2178, -44.7131],
    distanceKmFromSP: 268,
    highlight: 'Parque Nacional da Serra da Bocaina e casario colonial'
  },
  {
    name: 'Ouro Preto',
    subtitle: 'Cidades Históricas',
    state: 'MG',
    coords: [-20.3856, -43.5036],
    distanceKmFromSP: 630,
    highlight: 'Arte barroca, serras mineiras e gastronomia'
  },
  {
    name: 'Brotas',
    subtitle: 'Capital da Aventura',
    state: 'SP',
    coords: [-22.2839, -48.1278],
    distanceKmFromSP: 245,
    highlight: 'Cachoeiras, ecoturismo e estradas de interior'
  },
  {
    name: 'Santos / Guarujá',
    subtitle: 'Litoral Sul & Serra do Mar',
    state: 'SP',
    coords: [-23.9618, -46.3322],
    distanceKmFromSP: 78,
    highlight: 'Descida dos Imigrantes e orla da praia'
  },
  {
    name: 'Morretes / Serra da Graciosa',
    subtitle: 'Estrada da Graciosa',
    state: 'PR',
    coords: [-25.4747, -48.8344],
    distanceKmFromSP: 420,
    highlight: 'Mata Atlântica preservada e curvas históricas'
  }
];

export const INITIAL_COMMUNITY_ROUTES: CommunityRoute[] = [
  {
    id: 'comm-1',
    title: 'Serra da Mantiqueira & Rota dos Mirantes',
    authorName: 'Rodrigo Mototour',
    authorTier: 'Diamante',
    distanceKm: 185,
    durationText: '3h 15min',
    region: 'São Paulo / Campos do Jordão',
    vehicleType: 'motorcycle',
    tags: ['Estradas e Mirantes', 'Curvas Rápidas', 'Mirantes', 'Asfalto Bom'],
    rating: 4.9,
    reviewsCount: 38,
    imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=600&q=80',
    description: 'Percurso clássico subindo a SP-123 com parada no Mirante Vista Chinesa e almoço em Santo Antônio do Pinhal.',
    stopsCount: 4,
    scenicHighlights: ['Mirante da Vista Chinesa', 'Pico do Agudo', 'Empório da Serra']
  },
  {
    id: 'comm-2',
    title: 'Estrada Real: Cunha até Paraty Colonial',
    authorName: 'Camila & Fernando',
    authorTier: 'Ouro',
    distanceKm: 275,
    durationText: '5h 10min',
    region: 'Vale do Paraíba & Costa Verde',
    vehicleType: 'car',
    tags: ['Cidades Históricas', 'História', 'Cultura', 'Cidades Coloniais'],
    rating: 4.8,
    reviewsCount: 24,
    imageUrl: 'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?auto=format&fit=crop&w=600&q=80',
    description: 'Atravessando a Serra da Bocaina pela calçada de pedras histórica até o casario colonial e o mar de Paraty.',
    stopsCount: 5,
    scenicHighlights: ['Lavandário de Cunha', 'Pedra da Macela', 'Centro Histórico de Paraty']
  },
  {
    id: 'comm-3',
    title: 'Passeio Circular Vale dos Vinhedos Paulista',
    authorName: 'Marcos Vinicius',
    authorTier: 'Prata',
    distanceKm: 98,
    durationText: '2h 20min',
    region: 'São Roque & Jundiaí',
    vehicleType: 'car',
    tags: ['Gastronomia', 'Sabores pelo caminho', 'Vinícolas', 'Café Colonial'],
    rating: 4.7,
    reviewsCount: 19,
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    description: 'Estrada do Vinho em São Roque, visitando cantinas tradicionais, gastronomia no fogão a lenha e retornando pela Castelo.',
    stopsCount: 3,
    scenicHighlights: ['Vinícola Góes', 'Quinta do Olivardo', 'Mirante do Morro do Saboó']
  },
  {
    id: 'comm-4',
    title: 'Circuito das Cachoeiras & Ecoturismo de Brotas',
    authorName: 'Juliana Aventureira',
    authorTier: 'Diamante',
    distanceKm: 245,
    durationText: '3h 40min',
    region: 'Interior de SP / Brotas',
    vehicleType: 'car',
    tags: ['Natureza', 'Parques e cachoeiras', 'Trilhas', 'Ecoturismo'],
    rating: 4.9,
    reviewsCount: 31,
    imageUrl: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=600&q=80',
    description: 'Roteiro com passagens por cânions, cachoeiras preservadas com piscinas naturais e parques ecológicos floridos.',
    stopsCount: 4,
    scenicHighlights: ['Parque dos Saltos', 'Recanto das Cachoeiras', 'Cachoeira Cassorova']
  },
  {
    id: 'comm-5',
    title: 'Serra da Graciosa & Curvas da Mata Atlântica',
    authorName: 'Thiago R.',
    authorTier: 'Ouro',
    distanceKm: 140,
    durationText: '2h 50min',
    region: 'Paraná / Morretes & Antonina',
    vehicleType: 'motorcycle',
    tags: ['Estradas e Mirantes', 'Rotas panorâmicas', 'Mata Atlântica', 'Curvas'],
    rating: 4.9,
    reviewsCount: 45,
    imageUrl: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=600&q=80',
    description: 'Descida cênica da antiga ferrovia e estrada de paralelepípedos com hortênsias, mirantes da serra e almoço com barreado.',
    stopsCount: 3,
    scenicHighlights: ['Mirante da Graciosa', 'Recanto Cascatinha', 'Centro Histórico de Morretes']
  },
  {
    id: 'comm-6',
    title: 'Rota dos Queijos Artesanais & Serra da Canastra',
    authorName: 'Patrícia Minas',
    authorTier: 'Prata',
    distanceKm: 210,
    durationText: '4h 00min',
    region: 'Minas Gerais / São Roque de Minas',
    vehicleType: 'car',
    tags: ['Gastronomia', 'Natureza', 'Sabores pelo caminho', 'Queijarias'],
    rating: 4.8,
    reviewsCount: 22,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    description: 'Fazendas históricas produtoras do legítimo queijo Canastra, café caipira no tacho e visita à nascente histórica.',
    stopsCount: 4,
    scenicHighlights: ['Fazenda Bela Vista', 'Cachoeira Casca d’Anta', 'Mirante da Canastra']
  }
];

export const INITIAL_STOPS_MAP: Record<string, RouteStop[]> = {
  'Campos do Jordão': [
    {
      id: 'st-1',
      name: 'Mirante Vista Chinesa',
      category: 'mirante',
      lat: -22.7562,
      lng: -45.5781,
      description: 'Vista panorâmica do Vale do Paraíba na subida da serra.',
      recommendedMinutes: 25,
      rating: 4.9,
      estimatedArrivalHour: '09:45'
    },
    {
      id: 'st-2',
      name: 'Posto Graal 125 (Parada Técnica)',
      category: 'posto',
      lat: -22.9511,
      lng: -45.4523,
      description: 'Abastecimento, calibragem e café artesanal.',
      recommendedMinutes: 20,
      rating: 4.5,
      estimatedArrivalHour: '08:50'
    },
    {
      id: 'st-3',
      name: 'Vila Capivari & Cafeteria da Serra',
      category: 'restaurante',
      lat: -22.7335,
      lng: -45.5925,
      description: 'Gastronomia regional, fondue e chocolates artesanais.',
      recommendedMinutes: 60,
      rating: 4.8,
      estimatedArrivalHour: '11:15'
    }
  ]
};

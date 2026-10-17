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

import type {Place} from '../types/admin';
import {TOURIST_PLACE_KINDS} from '../types/admin';
import type {ExploreArea, ExploreCoords, ExploreFilter, ExplorePlace} from '../types/explore';
import {EXPLORE_CATALOG} from '../catalogs/explore';

const touristKinds = new Set<string>(TOURIST_PLACE_KINDS);
const natureKinds = new Set(['park', 'waterfall', 'lake', 'nature_reserve', 'trail', 'beach', 'viewpoint']);
const cultureKinds = new Set(['museum', 'theatre', 'historic']);
const metropolitanCities = new Set(['São Paulo','Arujá','Barueri','Biritiba Mirim','Caieiras','Cajamar',
  'Carapicuíba','Cotia','Diadema','Embu das Artes','Embu-Guaçu','Ferraz de Vasconcelos',
  'Francisco Morato','Franco da Rocha','Guararema','Guarulhos','Itapecerica da Serra','Itapevi',
  'Itaquaquecetuba','Jandira','Juquitiba','Mairiporã','Mauá','Mogi das Cruzes','Osasco',
  'Pirapora do Bom Jesus','Poá','Ribeirão Pires','Rio Grande da Serra','Salesópolis',
  'Santa Isabel','Santana de Parnaíba','Santo André','São Bernardo do Campo','São Caetano do Sul',
  'São Lourenço da Serra','Suzano','Taboão da Serra','Vargem Grande Paulista'].map(normalizeExploreText));
const coastalCities = new Set(['Santos','São Vicente','Guarujá','Praia Grande','Bertioga','Cubatão',
  'Mongaguá','Itanhaém','Peruíbe','Caraguatatuba','São Sebastião','Ilhabela','Ubatuba',
  'Iguape','Ilha Comprida','Cananéia'].map(normalizeExploreText));

export const EXPLORE_AREA_LABELS: Record<ExploreArea, string> = {
  all:'Todo o estado',metropolitan:'Capital e Grande SP',inland:'Interior',coast:'Litoral'
};

export function exploreArea(place: ExplorePlace): Exclude<ExploreArea, 'all'> | undefined {
  const city=normalizeExploreText(place.city);
  if(metropolitanCities.has(city))return 'metropolitan';
  if(coastalCities.has(city))return 'coast';
  if(place.curated || /,\s*(SP|São Paulo)(,\s*Brasil)?\s*$/i.test(place.address))return 'inland';
  return undefined;
}

export function normalizeExploreText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function exploreDistanceKm(from: ExploreCoords, to: ExploreCoords): number {
  const rad = Math.PI / 180;
  const dLat = (to[0] - from[0]) * rad, dLon = (to[1] - from[1]) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from[0] * rad) * Math.cos(to[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sourceToExplore(place: Place): ExplorePlace {
  const parts = place.address.split(',').map(part => part.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 2] : parts[0] || '';
  const category = place.kind === 'scenic_road' ? 'Estrada' :
    cultureKinds.has(place.kind) || place.kind === 'landmark' ? 'Cultura' : 'Natureza';
  return {id: place.id, name: place.name, coords: [place.lat, place.lng],
    kind: place.kind, address: place.address, category, city, sourceUrl: place.sourceUrl};
}

/** Prefer verified editorial photos without duplicating the same imported attraction. */
export function mergeExplorePlaces(
  imported: Place[], origin?: ExploreCoords,
  catalog: readonly ExplorePlace[] = EXPLORE_CATALOG
): ExplorePlace[] {
  const result = [...catalog];
  const names = new Map<string, ExplorePlace[]>();
  for (const place of catalog) {
    for (const name of [place.name, ...(place.aliases || [])]) {
      const key = normalizeExploreText(name);
      names.set(key, [...(names.get(key) || []), place]);
    }
  }
  for (const source of imported) {
    if (!source.active || !touristKinds.has(source.kind) ||
      !Number.isFinite(source.lat) || !Number.isFinite(source.lng) ||
      Math.abs(source.lat) > 90 || Math.abs(source.lng) > 180) continue;
    const place = sourceToExplore(source);
    const duplicates = names.get(normalizeExploreText(place.name)) || [];
    if (duplicates.some(candidate => exploreDistanceKm(candidate.coords, place.coords) <= 2)) continue;
    if (result.some(candidate => candidate.id === place.id)) continue;
    result.push(place);
    names.set(normalizeExploreText(place.name), [...duplicates, place]);
  }
  return origin ? result.sort((a, b) => exploreDistanceKm(origin, a.coords) - exploreDistanceKm(origin, b.coords)) : result;
}

export function filterExplorePlaces(
  places: readonly ExplorePlace[], filter: ExploreFilter, query: string, origin?: ExploreCoords,
  area: ExploreArea = 'all'
): ExplorePlace[] {
  const terms = normalizeExploreText(query).split(' ').filter(Boolean);
  return places.filter(place => {
    if (area !== 'all' && exploreArea(place) !== area) return false;
    // A destination explicitly searched for remains reachable beyond the nearby radius.
    if (filter === 'near' && origin && !terms.length && exploreDistanceKm(origin, place.coords) > 120) return false;
    if (filter === 'nature' && !natureKinds.has(place.kind)) return false;
    if (filter === 'waterfalls' && place.kind !== 'waterfall') return false;
    if (filter === 'lakes' && place.kind !== 'lake') return false;
    if (filter === 'parks' && place.kind !== 'park' && place.kind !== 'nature_reserve') return false;
    if (filter === 'racetracks' && place.category !== 'Autódromos') return false;
    if (filter === 'culture' && place.category !== 'Cultura' && !cultureKinds.has(place.kind)) return false;
    if (filter === 'road' && place.kind !== 'scenic_road' && place.category !== 'Estrada') return false;
    if (filter === 'cities' && place.kind !== 'city') return false;
    const text = normalizeExploreText([place.name, place.city, place.address, place.category, ...(place.aliases || [])].join(' '));
    return terms.every(term => text.includes(term));
  });
}

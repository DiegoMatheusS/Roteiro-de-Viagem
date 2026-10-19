import React, { useState } from 'react';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { InteractiveMap } from './InteractiveMap';
import { TOURIST_PLACE_KINDS, type Place } from '../types/admin';
import { Vehicle } from '../types';
import type { CommunityRoute } from '../types';
const INITIAL_COMMUNITY_ROUTES: CommunityRoute[] = [];
import { 
  Search, 
  SlidersHorizontal, 
  Flame, 
  Star, 
  ChevronRight, 
  X,
  MapPin,
  Clock,
  Gauge,
  Sparkles,
  Check
} from 'lucide-react';

interface ToursTabProps {
  currentVehicle: Vehicle | null;
  onLaunchCircularTour: (params: { distanceKm?: number; durationHours?: number; budget?: number; returnHour?: string; isSurprise?: boolean }) => void;
  onOpenCommunityRoute: (routeId: string) => void;
  onOpenPlace?: (place: Place) => void;
}

interface DestinationCategory {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  tagFilter: string;
}

const DESTINATION_CATEGORIES: DestinationCategory[] = [
  {
    id: 'estradas',
    title: 'Estradas e Mirantes',
    subtitle: 'Rotas panorâmicas',
    imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80',
    tagFilter: 'Estradas e Mirantes'
  },
  {
    id: 'historicas',
    title: 'Cidades Históricas',
    subtitle: 'Cultura e turismo',
    imageUrl: 'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?auto=format&fit=crop&w=800&q=80',
    tagFilter: 'Cidades Históricas'
  },
  {
    id: 'gastronomia',
    title: 'Gastronomia',
    subtitle: 'Sabores pelo caminho',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    tagFilter: 'Gastronomia'
  },
  {
    id: 'natureza',
    title: 'Natureza',
    subtitle: 'Parques e cachoeiras',
    imageUrl: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=800&q=80',
    tagFilter: 'Natureza'
  }
];

export const ToursTab: React.FC<ToursTabProps> = ({
  currentVehicle,
  onLaunchCircularTour,
  onOpenCommunityRoute, onOpenPlace
}) => {
  const gps=useDeviceLocation(true,'role-explore');
  const liveCoords=gps.status==='ready'?gps.position?.coords:undefined;
  const nearby=useNearbyPlaces(liveCoords?[liveCoords]:[],Boolean(liveCoords))
    .filter(place=>TOURIST_PLACE_KINDS.some(kind=>kind===place.kind));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'rating' | 'distance_asc' | 'distance_desc'>('rating');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState<'all' | 'motorcycle' | 'car'>('all');

  const handleSelectCategory = (tag: string) => {
    if (selectedCategory === tag) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(tag);
    }
  };

  // Filter routes based on search query, category, and vehicle type
  const filteredRoutes = INITIAL_COMMUNITY_ROUTES.filter(route => {
    // Search query filter (matches title, region, description, tags or author)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesTitle = route.title.toLowerCase().includes(q);
      const matchesRegion = route.region.toLowerCase().includes(q);
      const matchesDesc = route.description.toLowerCase().includes(q);
      const matchesTag = route.tags.some(t => t.toLowerCase().includes(q));
      const matchesAuthor = route.authorName.toLowerCase().includes(q);
      if (!matchesTitle && !matchesRegion && !matchesDesc && !matchesTag && !matchesAuthor) {
        return false;
      }
    }

    // Category filter
    if (selectedCategory) {
      const matchesCat = route.tags.some(t => 
        t.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        selectedCategory.toLowerCase().includes(t.toLowerCase())
      ) || route.title.toLowerCase().includes(selectedCategory.toLowerCase());
      if (!matchesCat) return false;
    }

    // Vehicle type filter
    if (vehicleFilter !== 'all' && route.vehicleType !== vehicleFilter) {
      return false;
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'rating') return b.rating - a.rating;
    if (sortBy === 'distance_asc') return a.distanceKm - b.distanceKm;
    if (sortBy === 'distance_desc') return b.distanceKm - a.distanceKm;
    return 0;
  });

  return (
    <div className="rdv-figma-page min-h-[calc(100vh-4rem)] pb-24 bg-white overflow-y-auto">
      <div className="max-w-xl mx-auto px-5 pb-5 pt-[72px] space-y-5">
        {/* TOP BAR: Explorar Passeios & Filter Icon */}
        <div className="flex items-center justify-between pt-1">
          <div><h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Explorar</h1><p className="text-xs text-slate-500 mt-1">Descubra o próximo caminho</p></div>
          <button
            type="button"
            onClick={() => setShowFilterModal(true)}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-colors cursor-pointer shadow-2xs"
            title="Filtros e ordenação"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* SEARCH INPUT */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar passeios"
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-all cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3 h-3 stroke-[2.5]" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="rdv-figma-mode is-current">Perto de mim</span>
          <button type="button" className="rdv-figma-mode" onClick={()=>handleSelectCategory('Natureza')}>Natureza</button>
          <button type="button" className="rdv-figma-mode" onClick={()=>handleSelectCategory('Estradas e Mirantes')}>Estrada</button>
        </div>
        <div className="relative w-full h-[195px] rounded-2xl overflow-hidden bg-[#eef0ec]">
          {liveCoords
           ? <InteractiveMap roadStyle userLiveCoords={liveCoords} showFuelStations={false} className="w-full h-full"/>
           : <div className="h-full grid place-items-center text-xs text-slate-500">Ative o GPS para visualizar passeios próximos.</div>}
        </div>
        <section className="bg-white rounded-t-[22px] -mx-5 px-5 py-4 space-y-3 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-[16px]">Perto de você</h2>
            <span className="text-[11px] text-slate-500">{gps.status==='ready'?'Da sua localização':'Aguardando GPS'}</span></div>
          {nearby.filter(place=>!searchQuery.trim()||`${place.name} ${place.address}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR'))).length===0
            ? <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-4">{liveCoords?'Nenhum passeio cadastrado próximo com esse filtro.':'Ative sua localização para descobrir passeios próximos.'}</p>
            : nearby.filter(place=>!searchQuery.trim()||`${place.name} ${place.address}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')))
              .slice(0,12).map(place=><button type="button" key={place.id} onClick={()=>onOpenPlace?.(place)}
                className="w-full text-left flex items-center gap-3 py-3 border-b border-slate-100">
                <span className="w-[56px] h-[56px] rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><MapPin size={22}/></span>
                <span className="flex-1 min-w-0"><small className="block text-[10px] text-blue-600 font-semibold">Passeio próximo</small>
                  <strong className="block text-[13px] text-slate-800 truncate">{place.name}</strong>
                  <span className="block text-xs text-slate-500 truncate">{place.address}</span></span>
                <ChevronRight size={17} className="text-blue-500"/></button>)}
        </section>
        {/* SECTION: Descubra seu próximo destino */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
              Descubra seu próximo destino
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
              Passeios recomendados para conhecer novos lugares.
            </p>
          </div>

          {/* 2X2 CARDS GRID (EXACT LAYOUT FROM USER IMAGE) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
            {DESTINATION_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.tagFilter;
              return (
                <div
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.tagFilter)}
                  className={`rounded-2xl border bg-white overflow-hidden transition-all duration-200 cursor-pointer group shadow-2xs flex flex-col ${
                    isSelected
                      ? 'border-emerald-600 ring-2 ring-emerald-600/30 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  {/* Photo with cover aspect ratio */}
                  <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100">
                    <img
                      src={cat.imageUrl}
                      alt={cat.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  {/* Card Label Content */}
                  <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1">
                    <div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                        {cat.title}
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">
                        {cat.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Category Filter Tag banner if selected */}
          {selectedCategory && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 animate-in fade-in">
              <div className="flex items-center gap-1.5 text-xs text-emerald-900 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Filtrando por: <strong>{selectedCategory}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                Limpar filtro
              </button>
            </div>
          )}
        </div>

        {/* SECTION: Roteiros Mais Bem Avaliados - Comunidade de Viajantes */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>Roteiros Mais Bem Avaliados</span>
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              Comunidade de Viajantes
            </span>
          </div>

          {/* Route Cards */}
          <div className="space-y-3">
            {filteredRoutes.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <Search className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  Nenhum roteiro encontrado para os filtros selecionados
                </p>
                <p className="text-[11px] text-slate-500">
                  Tente buscar por outro termo ou limpe a categoria selecionada.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory(null);
                    setVehicleFilter('all');
                  }}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                >
                  Ver Todos os Roteiros
                </button>
              </div>
            ) : (
              filteredRoutes.map((route) => (
                <div
                  key={route.id}
                  className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 hover:border-slate-300 transition-all shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">
                        {route.region}
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
                        {route.title}
                      </h3>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>Por <strong>{route.authorName}</strong></span>
                        <span>·</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                          Nível {route.authorTier}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-amber-600 flex items-center gap-1 justify-end">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {route.rating.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {route.reviewsCount} avaliações
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {route.description}
                  </p>

                  {/* Highlights / Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {route.tags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => setSelectedCategory(tag)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                          selectedCategory === tag
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Footer Stats & View on Map CTA */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5 text-slate-500 text-[11px] font-medium">
                      <span className="flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-slate-400" />
                        {route.distanceKm} km
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {route.durationText}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {route.stopsCount} paradas
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenCommunityRoute(route.id)}
                      className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <span>Ver no Mapa</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* FILTER & SORT MODAL */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>Filtrar Passeios</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ordenação */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Ordenar por:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'rating', label: 'Mais Bem Avaliados' },
                  { id: 'distance_asc', label: 'Menor Distância' },
                  { id: 'distance_desc', label: 'Maior Distância' }
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortBy(s.id as any)}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                      sortBy === s.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo de Veículo */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Preferência de Veículo:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'motorcycle', label: '🏍️ Moto' },
                  { id: 'car', label: '🚗 Carro' }
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleFilter(v.id as any)}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                      vehicleFilter === v.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFilterModal(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


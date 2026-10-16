import type { RouteToll } from '../types/tolls';
import { TollModal } from './TollModal';
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RouteStop, WeatherPoint, ConvoyParticipant, MeetingPoint, RouteModality } from '../types';
import { Layers, Mountain, Eye, Sparkles, X } from 'lucide-react';
import { useFuelStations } from '../hooks/useFuelStations';
import { FuelStationModal } from './FuelStationModal';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { PlaceModal } from './PlaceModal';
import { PLACE_KINDS, TOURIST_PLACE_KINDS, type Place } from '../types/admin';
import { ROAD_ALERT_TYPES, type RoadAlert } from '../types/roadAlerts';
import { confirmRoadAlert } from '../hooks/useRoadAlerts';
import { getCurrentDeviceLocation } from '../services/locationService';
import { mapContributionIcon } from './mapContributionIcon';
import { splitRouteAtPosition } from '../services/routeProgress';

export type MapStyleType = 'light' | 'satellite' | 'topo';
export interface MapVisiblePlace {
  id: string;
  name: string;
  kind: string;
  address: string;
  coords: [number, number];
}

interface InteractiveMapProps {
  originCoords?: [number, number];
  destinationCoords?: [number, number];
  originLabel?: string;
  destinationLabel?: string;
  routePath?: [number, number][];
  /** Percursos simultâneos; um está selecionado e os demais permanecem clicáveis. */
  routeAlternatives?: {id:string; routePath:[number,number][]}[];
  selectedRouteId?: string;
  onSelectRoute?: (id: string) => void;
  routeModality?: RouteModality;
  stops?: RouteStop[];
  weatherPoints?: WeatherPoint[];
  tolls?: RouteToll[];
  tollVehicleType?: 'car' | 'motorcycle';
  showRainLayer?: boolean;
  userLiveCoords?: [number, number];
  focusedCoords?: [number, number] | null;
  convoyParticipants?: ConvoyParticipant[];
  meetingPoints?: MeetingPoint[];
  interactive?: boolean;
  className?: string;
  onSelectCoordinates?: (coords: [number, number], placeName?: string) => void;
  showFuelStations?: boolean;
  navigationMode?: boolean;
  travelledDistanceKm?: number;
  totalRouteKm?: number;
  blueRoute?: boolean;
  roadStyle?: boolean;
  followUser?: boolean;
  roadAlerts?: RoadAlert[];
  onRoadAlertUpdated?: () => void;
  /** Lista apenas marcadores realmente renderizados dentro do viewport do mapa. */
  onVisiblePlacesChange?: (places: MapVisiblePlace[]) => void;
  /** Cada incremento centraliza o mapa no GPS, sem forçar acompanhamento ao arrastar. */
  centerOnUserRequest?: number;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// O CARTO passou a renderizar “API KEY REQUIRED” sem chave. Mapa padrão: OSM oficial sem token.
const TILE_PROVIDERS: Record<MapStyleType, { name: string; url: string; attribution: string; maxZoom: number; icon: string }> = {
  light: {
    name: 'Claro (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> colaboradores',
    maxZoom: 19,
    icon: '🗺️'
  },
  satellite: {
    name: 'Satélite Real',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
    icon: '🛰️'
  },
  topo: {
    name: 'Relevo / Serras',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap, © OpenStreetMap colaboradores',
    maxZoom: 17,
    icon: '⛰️'
  }
};

// Vibrant modality colors
const MODALITY_COLORS: Record<RouteModality, { primary: string; glow: string; border: string }> = {
  panoramica: { primary: '#059669', glow: '#34d399', border: '#ffffff' }, // Emerald green
  turistica: { primary: '#7c3aed', glow: '#a78bfa', border: '#ffffff' }, // Vibrant violet
  gastronomica: { primary: '#ea580c', glow: '#fb923c', border: '#ffffff' }, // Warm orange
  rapida: { primary: '#2563eb', glow: '#60a5fa', border: '#ffffff' }, // Royal blue
  economica: { primary: '#16a34a', glow: '#4ade80', border: '#ffffff' }, // Vibrant green
  equilibrada: { primary: '#0d9488', glow: '#2dd4bf', border: '#ffffff' } // Teal
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  originCoords,
  destinationCoords,
  originLabel = 'Origem',
  destinationLabel = 'Destino',
  routePath = [],
  routeAlternatives = [],
  selectedRouteId,
  onSelectRoute,
  routeModality = 'panoramica',
  stops = [],
  showRainLayer = false,
  weatherPoints = [],
  tolls = [],
  tollVehicleType,
  userLiveCoords,
  focusedCoords,
  convoyParticipants = [],
  meetingPoints = [],
  onSelectCoordinates,
  showFuelStations = true,
  navigationMode = false,
  travelledDistanceKm = 0,
  totalRouteKm = 0,
  blueRoute = false,
  roadStyle = false,
  followUser = true,
  roadAlerts = [],
  onRoadAlertUpdated,
  onVisiblePlacesChange,
  centerOnUserRequest = 0,
  className = 'w-full h-full'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);
  const rainLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const fuelLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tollLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const roadAlertGroupRef = useRef<L.LayerGroup | null>(null);
  const fittedGeometryRef=useRef<string|null>(null);
  const lastFollowRef=useRef<[number, number] | null>(null);
  const [viewportCenter, setViewportCenter] = useState<[number, number] | null>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const visibleCallbackRef = useRef(onVisiblePlacesChange);
  visibleCallbackRef.current = onVisiblePlacesChange;
  const visibleKeyRef = useRef('');
  const [hasMapReady, setHasMapReady] = useState(false);
  const discoveryPoints = routePath.length ? routePath : originCoords ? [originCoords]
    : viewportCenter ? [viewportCenter] : [];

  const fuel = useFuelStations(discoveryPoints, showFuelStations);
  const places = useNearbyPlaces(discoveryPoints, showFuelStations && discoveryPoints.length > 0);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [stationSection, setStationSection] = useState<'prices' | 'comments'>('prices');
  const [tollSection, setTollSection] = useState<'prices' | 'comments'>('prices');
  const [catalogToll, setCatalogToll] = useState<Place | null>(null);
  const openStation = (id: string, section: 'prices' | 'comments' = 'prices') => { setStationSection(section); setSelectedStation(id); };
  const openToll = (id: string, section: 'prices' | 'comments' = 'prices', place: Place | null = null) => { setTollSection(section); setCatalogToll(place); setSelectedTollId(id); };
  const [selectedTollId,setSelectedTollId]=useState<string|null>(null);
  const selectedToll: RouteToll | undefined = tolls.find(t => t.id === selectedTollId) || (catalogToll && selectedTollId === catalogToll.id ? { id: catalogToll.id, name: catalogToll.name, coords: [catalogToll.lat, catalogToll.lng], sourceUrl: catalogToll.sourceUrl, passages: 1, price: null } : undefined);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const [currentStyle, setCurrentStyle] = useState<MapStyleType>('light');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [tileRetryCount, setTileRetryCount] = useState(0);
  const [selectedRoadAlert, setSelectedRoadAlert] = useState<RoadAlert | null>(null);
  const [alertCheckBusy, setAlertCheckBusy] = useState(false);
  const [alertCheckMessage, setAlertCheckMessage] = useState('');
  const [alertCheckError, setAlertCheckError] = useState('');
  const [alertCheckDone, setAlertCheckDone] = useState(false);
  const checkRoadAlert = async (present: boolean) => {
    if (!selectedRoadAlert || alertCheckBusy) return;
    setAlertCheckBusy(true); setAlertCheckError('');
    try {
      const gps = await getCurrentDeviceLocation();
      const answer = await confirmRoadAlert(selectedRoadAlert.id, present, gps);
      setAlertCheckDone(true);
      setAlertCheckMessage(answer.removed
        ? 'Ocorrência retirada do mapa após confirmação da comunidade.'
        : 'Confirmação registrada. Obrigado por ajudar a manter o mapa atualizado.');
      onRoadAlertUpdated?.();
    } catch (error) {
      setAlertCheckError((error as Error).message);
    } finally { setAlertCheckBusy(false); }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: originCoords || [-14.2, -51.9],
      zoom: originCoords ? 11 : 4,
      zoomControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
      attributionControl: true
    });

    // Estilo Waze: zoom apenas por pinça ou gesto; sem controles + e −.

    const group = L.layerGroup().addTo(map);
    layersGroupRef.current = group;

    const rainGroup = L.layerGroup().addTo(map);
    rainLayerGroupRef.current = rainGroup;
    fuelLayerGroupRef.current = L.layerGroup().addTo(map);
    tollLayerGroupRef.current = L.layerGroup().addTo(map);
    roadAlertGroupRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    setHasMapReady(true);

    // Handle container resize to ensure tiles NEVER remain blank white
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      map.stop();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // O mapa pode ser explorado sem GPS: descobrir dados do local central após zoom.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handleMovement = () => {
      setViewportRevision(value => value + 1);
      if (routePath.length || originCoords) return;
      if (map.getZoom() < 10) { setViewportCenter(null); return; }
      const center = map.getCenter();
      setViewportCenter(current => {
        const next: [number, number] = [Math.round(center.lat * 100)/100, Math.round(center.lng * 100)/100];
        return current && current[0]===next[0] && current[1]===next[1] ? current : next;
      });
    };
    map.on('moveend', handleMovement);
    map.on('zoomend', handleMovement);
    handleMovement();
    return () => { map.off('moveend', handleMovement); map.off('zoomend', handleMovement); };
  }, [hasMapReady, routePath.length, originCoords?.[0], originCoords?.[1]]);

  useEffect(() => {
    if (centerOnUserRequest < 1 || !userLiveCoords || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo(userLiveCoords, 15, {duration: 0.5});
  }, [centerOnUserRequest, userLiveCoords?.[0], userLiveCoords?.[1]]);


  useEffect(() => {
    const group=tollLayerGroupRef.current;
    if(!group)return;group.clearLayers();
    if(!tollVehicleType)return;
    for(const toll of navigationMode ? [] : (Array.isArray(tolls) ? tolls : [])) {
      const icon=mapContributionIcon({className:'toll-marker',name:toll.name,emoji:'🛣️',color:'#0e7490',onPrices:()=>openToll(toll.id),onComments:()=>openToll(toll.id,'comments')});
      const marker=L.marker(toll.coords,{icon,title:toll.name,keyboard:false,zIndexOffset:1700}).addTo(group);
      const tip=document.createElement('span');tip.textContent=`${toll.name} · Ver tarifas / contribuir`;marker.bindTooltip(tip);
      marker.on('click',() => openToll(toll.id));
    }
  },[tolls,tollVehicleType,navigationMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !onSelectCoordinates) return;
    const handleClick = (event: L.LeafletMouseEvent) => onSelectCoordinates([event.latlng.lat, event.latlng.lng]);
    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [onSelectCoordinates]);

  useEffect(() => {
    const group = fuelLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const station of navigationMode ? [] : (Array.isArray(fuel.stations) ? fuel.stations : [])) {
      const icon = mapContributionIcon({ className: 'fuel-station-marker', name: station.name, emoji: '⛽', color: '#047857', onPrices: () => openStation(station.id), onComments: () => openStation(station.id, 'comments') });
      const marker = L.marker([station.lat, station.lng], { icon, title: station.name, keyboard: false, zIndexOffset: 1500, riseOnHover: true }).addTo(group);
      const tooltip = document.createElement('span'); tooltip.textContent = `${station.name} · Ver preços`;
      marker.bindTooltip(tooltip);
      marker.on('click', () => openStation(station.id));
    }
    for (const place of (Array.isArray(places) ? places : []).filter(place => !navigationMode || (TOURIST_PLACE_KINDS as readonly string[]).includes(place.kind))) {
      if (place.kind === 'toll') {
        if (tolls.some(toll => toll.id === place.id)) continue;
        const icon = mapContributionIcon({ className: 'toll-marker managed-toll-marker', name: place.name, emoji: '🛣️', color: '#0e7490', onPrices: () => openToll(place.id, 'prices', place), onComments: () => openToll(place.id, 'comments', place) });
        L.marker([place.lat, place.lng], { icon, title: place.name, keyboard: false, zIndexOffset: 1700 }).addTo(group);
        continue;
      }
      const emoji = PLACE_KINDS.find(kind => kind.id === place.kind)?.icon || '📍';
      const icon = L.divIcon({ className: 'managed-place-marker', html: `<div style="background:#2563eb;border:2px solid white;border-radius:11px;padding:5px;font-size:18px;box-shadow:0 2px 8px #0003">${emoji}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      const marker = L.marker([place.lat, place.lng], { icon, title: place.name, zIndexOffset: 1400, riseOnHover: true }).addTo(group);
      const tooltip = document.createElement('span'); tooltip.textContent = `${place.name} · Ver estabelecimento`;
      marker.bindTooltip(tooltip); marker.on('click', () => setSelectedPlace(place));
      marker.on('keypress', event => {
        const original = (event as L.LeafletKeyboardEvent).originalEvent;
        if (original.key === 'Enter' || original.key === ' ') { original.preventDefault(); setSelectedPlace(place); }
      });
    }
  }, [fuel.stations, places, tolls, navigationMode]);

  // Usa exatamente as coleções cujos marcadores são desenhados pelas camadas acima.
  // Ao arrastar ou ampliar o mapa a lista muda, mas nenhum local fictício é criado.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const publish = visibleCallbackRef.current;
    if (!map || !publish) return;
    const bounds = map.getBounds();
    const all: MapVisiblePlace[] = [
      ...(!navigationMode && showFuelStations ? fuel.stations.map(station => ({
        id: station.id, name: station.name, kind: 'fuel', address: station.address,
        coords: [station.lat, station.lng] as [number, number]
      })) : []),
      ...(showFuelStations ? places
        .filter(place => !navigationMode || (TOURIST_PLACE_KINDS as readonly string[]).includes(place.kind))
        .filter(place => place.kind !== 'toll' || !tolls.some(toll => toll.id === place.id))
        .map(place => ({id: place.id, name: place.name, kind: place.kind, address: place.address,
          coords: [place.lat, place.lng] as [number, number]})) : []),
      ...(!navigationMode && tollVehicleType ? tolls.map(toll => ({
        id: toll.id, name: toll.name, kind:'toll', address:'',
        coords: toll.coords
      })) : []),
      ...stops.filter(stop => stop.category !== 'posto' || Boolean(stop.type)).map(stop => ({
        id: 'stop:' + stop.name + ':' + stop.lat + ':' + stop.lng,
        name: stop.name, kind: stop.category, address: stop.description,
        coords: [stop.lat, stop.lng] as [number, number]
      }))
    ];
    const unique = new Map<string,MapVisiblePlace>();
    for(const place of all) {
      if (!bounds.contains(place.coords)) continue;
      const placeKey = place.coords.map(n=>n.toFixed(5)).join(',') + ':' + place.name.toLowerCase();
      if (!unique.has(placeKey)) unique.set(placeKey, place);
    }
    const center = map.getCenter();
    const ordered = [...unique.values()]
      .sort((a,b) => map.distance(a.coords,center)-map.distance(b.coords,center)).slice(0,25);
    const signature = JSON.stringify(ordered.map(p=>p.id));
    if (signature !== visibleKeyRef.current) {
      visibleKeyRef.current = signature;
      publish(ordered);
    }
  }, [fuel.stations, places, tolls, stops, navigationMode, showFuelStations, tollVehicleType, viewportRevision, hasMapReady]);

  // Somente eventos aprovados, com expiração válida, são apresentados no mapa.
  useEffect(() => {
    const group = roadAlertGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const now = Date.now();
    for (const alert of (Array.isArray(roadAlerts) ? roadAlerts : [])) {
      if (Date.parse(alert.expiresAt) <= now) continue;
      const kind = ROAD_ALERT_TYPES.find(value => value.id === alert.kind);
      if (!kind) continue;
      const icon = L.divIcon({
        className: 'road-alert-marker',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#fff7ed;border:2px solid #c2410c;border-radius:50%;font-size:18px;box-shadow:0 2px 9px #0003">${kind.icon}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
      });
      const marker = L.marker([alert.lat, alert.lng], { icon, keyboard: true, zIndexOffset: 2100 }).addTo(group);
      marker.on('click', () => {
        setSelectedRoadAlert(alert);
        setAlertCheckMessage('');
        setAlertCheckError('');
        setAlertCheckDone(false);
      });
    }
  }, [roadAlerts]);

  // Switch map tiles when user changes style
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }

    const tileConfig = TILE_PROVIDERS[roadStyle || navigationMode ? 'light' : currentStyle];
    setTileError(false);
    let consecutiveErrors = 0;
    const newTileLayer = L.tileLayer(tileConfig.url, {
      maxZoom: tileConfig.maxZoom,
      attribution: tileConfig.attribution,
      subdomains: tileConfig.url.includes('{s}') ? 'abc' : ''
    });
    newTileLayer.on('tileerror', () => {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) setTileError(true);
    });
    newTileLayer.on('tileload', () => {
      consecutiveErrors = 0;
      setTileError(false);
    });
    newTileLayer.addTo(map);

    // Ensure tile layer sits at the very bottom
    newTileLayer.bringToBack();
    currentTileLayerRef.current = newTileLayer;

    const timer = setTimeout(() => {
      if (mapInstanceRef.current === map) map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStyle, roadStyle, navigationMode, tileRetryCount]);

  // Smoothly center and fly to focused coordinates (e.g. when user clicks "Ver no Mapa" on meeting point)
  useEffect(() => {
    if (focusedCoords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(focusedCoords, 15, {
        duration: 1.2,
        easeLinearity: 0.25
      });
    }
  }, [focusedCoords]);

  // Update markers, polyline and layers when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    const rainGroup = rainLayerGroupRef.current;
    if (!map || !group || !rainGroup) return;

    group.clearLayers();
    rainGroup.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    // Helper for HTML markers
    const createHtmlIcon = (bgColor: string, text: string, iconHtml: string) => {
      return L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="
            background-color: ${bgColor};
            color: white;
            padding: 5px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.3);
            border: 2px solid white;
            white-space: nowrap;
            max-width: 160px;
          ">
            <span>${iconHtml}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;max-width:115px">${escapeHtml(text)}</span>
          </div>
        `,
        iconSize: [110, 32],
        iconAnchor: [55, 16]
      });
    };

    // 1. Origin Marker
    if (originCoords && !navigationMode) {
      const originIcon = roadStyle ? L.divIcon({
        className:'map-origin-dot',
        html:'<span style="display:block;width:16px;height:16px;background:#16a34a;border:3px solid white;border-radius:50%;box-shadow:0 2px 7px #0003"></span>',
        iconSize:[16,16],iconAnchor:[8,8]
      }) : createHtmlIcon('#059669', originLabel, '🟢');
      const originMarker = L.marker(originCoords, { icon: originIcon }).addTo(group);
      originMarker.bindPopup(`<b>Partida:</b> ${escapeHtml(originLabel)}`);
      bounds.push(originCoords);
    }

    // 2. Destination Marker
    if (destinationCoords) {
      const destIcon = roadStyle ? L.divIcon({
        className:'map-destination-dot',
        html:'<span style="display:block;width:17px;height:17px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 7px #0003"></span>',
        iconSize:[17,17],iconAnchor:[9,9]
      }) : createHtmlIcon('#2563eb', destinationLabel, '🏁');
      const destMarker = L.marker(destinationCoords, { icon: destIcon }).addTo(group);
      destMarker.bindPopup(`<b>Chegada:</b> ${escapeHtml(destinationLabel)}`);
      bounds.push(destinationCoords);
    }

    // Desenha todas as alternativas abaixo do percurso ativo; toque numa linha para escolhê-la.
    // Usamos a geometria devolvida pelo OSRM, nunca uma linha reta estimada.
    if (!navigationMode && routeAlternatives.length > 1) {
      for (const option of routeAlternatives) {
        if (option.id === selectedRouteId || option.routePath.length < 2) continue;
        L.polyline(option.routePath, {color:'#ffffff',weight:9,opacity:.86,lineCap:'round',lineJoin:'round',interactive:false}).addTo(group);
        const alternative = L.polyline(option.routePath, {color:'#64748b',weight:5,opacity:.78,lineCap:'round',lineJoin:'round',interactive:true,bubblingMouseEvents:false}).addTo(group);
        alternative.on('click',()=>onSelectRoute?.(option.id));
        alternative.bindTooltip('Selecionar rota alternativa', {sticky:true,direction:'top'});
        option.routePath.forEach(point=>bounds.push(point));
      }
    }

    // Navegação: azul claro à frente; azul escuro no trecho já percorrido.
    // A posição vem do GPS, sem colorir como concluído quando estiver fora da rota.
    const modalityStyle = MODALITY_COLORS[routeModality] || MODALITY_COLORS.panoramica;
    if (routePath && routePath.length > 1) {
      L.polyline(routePath, { color: '#ffffff', weight: 10, opacity: 0.96,
        lineCap: 'round', lineJoin: 'round' }).addTo(group);
      if (navigationMode || blueRoute) {
        const progress = splitRouteAtPosition(routePath, userLiveCoords, travelledDistanceKm, totalRouteKm);
        if (progress.remaining.length > 1) {
          L.polyline(progress.remaining, { color: '#67c7ff', weight: 7, opacity: 1,
            lineCap: 'round', lineJoin: 'round' }).addTo(group);
        }
        if (progress.travelled.length > 1) {
          L.polyline(progress.travelled, { color: '#17479b', weight: 7, opacity: 1,
            lineCap: 'round', lineJoin: 'round' }).addTo(group);
        }
      } else {
        L.polyline(routePath, { color: modalityStyle.glow, weight: 7, opacity: 0.6,
          lineCap: 'round', lineJoin: 'round' }).addTo(group);
        L.polyline(routePath, { color: modalityStyle.primary, weight: 5, opacity: 1,
          lineCap: 'round', lineJoin: 'round' }).addTo(group);
      }
      routePath.forEach((point, index) => {
        bounds.push(point);
        if (!navigationMode && !roadStyle && !blueRoute && index > 0 && index < routePath.length - 1 && index % 3 === 0) {
          const milestoneIcon = L.divIcon({
            className: 'route-milestone-marker',
            html: `<div style="width:10px;height:10px;background:#fff;border:2.5px solid ${modalityStyle.primary};border-radius:50%"></div>`,
            iconSize: [10, 10], iconAnchor: [5, 5]
          });
          L.marker(point, { icon: milestoneIcon }).addTo(group);
        }
      });
    }

    // 4. Scenic Stops Markers
    if (stops && stops.length > 0) {
      stops.filter(stop => stop.category !== 'posto' || Boolean(stop.type)).forEach((stop, index) => {
        let emoji = '📍';
        let color = '#d97706';
        if (stop.category === 'mirante') { emoji = '🌄'; color = '#059669'; }
        if (stop.category === 'restaurante') { emoji = '🍽️'; color = '#ea580c'; }
        if (stop.category === 'posto') { emoji = '⛽'; color = '#0284c7'; }
        if (stop.category === 'cidade_historica') { emoji = '🏛️'; color = '#7c3aed'; }
        if (stop.category === 'parque') { emoji = '🌲'; color = '#15803d'; }
        if (stop.category === 'museu') { emoji = '🏛️'; color = '#4f46e5'; }
        if (stop.category === 'monumento') { emoji = '🗿'; color = '#0891b2'; }

        const fuelReference = stop.category === 'posto' ? stop.sourceUrl?.match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/) : null;
        const stopIcon = fuelReference ? mapContributionIcon({ className: 'custom-stop-marker', name: stop.name, emoji: '⛽', color: '#047857', onPrices: () => openStation(`osm:${fuelReference[1]}:${fuelReference[2]}`), onComments: () => openStation(`osm:${fuelReference[1]}:${fuelReference[2]}`, 'comments') }) : L.divIcon({
          className: 'custom-stop-marker',
          html: `
            <div style="
              background-color: ${color};
              color: white;
              padding: 4px 8px;
              border-radius: 9999px;
              font-size: 10px;
              font-weight: 700;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.25);
              border: 2px solid white;
              white-space: nowrap;
            ">
              <span>${emoji}</span>
              <span>${index + 1}. ${escapeHtml(stop.name.substring(0, 20))}</span>
            </div>
          `,
          iconSize: [95, 26],
          iconAnchor: [47, 13]
        });

        const m = L.marker([stop.lat, stop.lng], { icon: stopIcon, keyboard: !fuelReference }).addTo(group);
        if (fuelReference) {
          m.on('click', () => openStation(`osm:${fuelReference[1]}:${fuelReference[2]}`));
        }
        m.bindPopup(`
          <div style="font-family: system-ui; max-width: 220px;">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">${escapeHtml(stop.name)}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">${escapeHtml(stop.description)}</div>
            <div style="font-size: 10px; color: #059669; font-weight: 700;">Parada recomendada: ${stop.recommendedMinutes} min</div>
          </div>
        `);
        bounds.push([stop.lat, stop.lng]);
      });
    }

    // 5. Live GPS User Marker
    if (userLiveCoords) {
      const liveIcon = L.divIcon({
        className: 'user-live-marker',
        html: `<div style="width:32px;height:32px;display:grid;place-items:center;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 7px #2563eb25,0 3px 12px #0f172a66;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M12 2 20 21 12 17 4 21 12 2Z"/></svg></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      L.marker(userLiveCoords, { icon: liveIcon, zIndexOffset: 1000 })
        .addTo(group)
        .bindPopup('<b>Sua Posição Atual (GPS)</b>');
    }

    // 6. Meeting Points (Pontos de Encontro do Comboio)
    if (meetingPoints && meetingPoints.length > 0) {
      meetingPoints.forEach((mp) => {
        let catIcon = '🚩';
        let bgMarkerColor = '#7c3aed';
        if (mp.category === 'posto') catIcon = '⛽';
        if (mp.category === 'restaurante') catIcon = '☕';
        if (mp.category === 'mirante') catIcon = '🌄';
        if (mp.category === 'minha_escolha') {
          catIcon = '⭐';
          bgMarkerColor = '#2563eb';
        }

        const arrivedCount = mp.confirmedArrivedParticipantIds.length;
        const mpIcon = L.divIcon({
          className: 'meeting-point-marker',
          html: `
            <div style="
              background-color: ${bgMarkerColor};
              color: white;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: 700;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
              border: 2px solid white;
              white-space: nowrap;
            ">
              <span>${catIcon}</span>
              <span>${escapeHtml(mp.title)}</span>
              <span style="background: rgba(255,255,255,0.25); padding: 1px 4px; border-radius: 6px; font-size: 9px;">${arrivedCount} no local</span>
            </div>
          `,
          iconSize: [110, 28],
          iconAnchor: [55, 14]
        });

        const addressParts = [
          mp.street ? `${mp.street}${mp.number ? ', ' + mp.number : ''}` : '',
          mp.neighborhood || '',
          mp.city || '',
          mp.cep ? `CEP ${mp.cep}` : ''
        ].filter(Boolean).join(' · ');

        const m = L.marker([mp.coords[0], mp.coords[1]], { icon: mpIcon, zIndexOffset: 800 }).addTo(group);
        m.bindPopup(`
          <div style="font-family: system-ui; max-width: 240px;">
            <div style="font-weight: bold; font-size: 13px; color: ${bgMarkerColor}; margin-bottom: 2px;">
              ${catIcon} Ponto de Encontro: ${escapeHtml(mp.title)}
            </div>
            ${addressParts ? `<div style="font-size: 10px; color: #334155; font-weight: 600; margin-bottom: 4px; background: #f1f5f9; padding: 3px 6px; border-radius: 6px;">📍 ${escapeHtml(addressParts)}</div>` : ''}
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">${escapeHtml(mp.description || 'Ponto de parada e reagrupamento do comboio.')}</div>
            <div style="font-size: 11px; font-weight: 600; color: #059669;">
              ${arrivedCount > 0 ? `✓ ${arrivedCount} participante(s) confirmaram chegada` : 'Nenhum participante chegou ainda'}
            </div>
          </div>
        `);
        bounds.push(mp.coords);
      });
    }

    // 7. Convoy Participants
    if (convoyParticipants && convoyParticipants.length > 0) {
      convoyParticipants
        .filter(p => p.isSharingLocation && p.coords && p.lastLocationTimestamp && Date.now()-new Date(p.lastLocationTimestamp).getTime()<=180000)
        .forEach(p => {
          const isMoto = p.vehicleType === 'motorcycle';
          const vehicleEmoji = isMoto ? '🏍️' : '🚗';
          const isStale = p.isStale;
          const bgBadgeColor = isStale ? '#64748b' : (p.isOrganizer ? '#dc2626' : '#2563eb');

          const participantIcon = L.divIcon({
            className: 'convoy-participant-marker',
            html: `
              <div style="
                background-color: ${bgBadgeColor};
                color: white;
                padding: 3px 8px;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                border: 2px solid white;
                white-space: nowrap;
              ">
                <span>${vehicleEmoji}</span>
                <span>${escapeHtml(p.name.split(' ')[0])}</span>
                ${isStale ? '<span style="font-size: 8px; opacity: 0.85;">⚠️ Sinal antigo</span>' : ''}
              </div>
            `,
            iconSize: [90, 26],
            iconAnchor: [45, 13]
          });

          const m = L.marker([p.coords![0], p.coords![1]], { icon: participantIcon, title:p.name, zIndexOffset: 950 }).addTo(group);
          bounds.push([p.coords![0], p.coords![1]]);
        });
    }

    // Actual provider forecast samples, without an invented radar polygon.
    if (showRainLayer) for (const point of weatherPoints || []) {
      if (!point.coords) continue;
      L.circleMarker(point.coords, { className: 'weather-forecast-marker', radius: 9, color: point.rainProb >= 50 ? '#0284c7' : '#475569', fillOpacity: 0.7 }).addTo(rainGroup)
        .bindPopup(`<b>${escapeHtml(point.locationName)}</b><br>Previsão: ${escapeHtml(point.condition)} · ${point.tempC}°C<br>Chuva: ${point.rainProb}% · Vento: ${point.windKmH} km/h${Number.isFinite(point.windDirectionDegrees) ? ` · direção ${Math.round(point.windDirectionDegrees!)}°` : ''} · ${escapeHtml(new Date(point.forecastAt || point.passTime).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}${point.warning ? `<br>${escapeHtml(point.warning)}` : ''}<br>Fonte: Open-Meteo (não é radar ao vivo)`);
    }

    // GPS refreshes move markers without undoing the user's zoom and map position.
    const geometryKey=JSON.stringify([originCoords,destinationCoords,routePath,routeAlternatives.map(r=>[r.id,r.routePath]),selectedRouteId,stops.map(s=>[s.lat,s.lng]),meetingPoints.map(p=>p.coords)]);
    if(fittedGeometryRef.current===geometryKey)return;
    if(bounds.length)fittedGeometryRef.current=geometryKey;
    if (bounds.length > 1) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, {
        padding: [60, 60],
        maxZoom: 13,
        animate: false
      });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 12);
    }
  }, [
    originCoords,
    destinationCoords,
    originLabel,
    destinationLabel,
    routePath,
    routeAlternatives,
    selectedRouteId,
    onSelectRoute,
    routeModality,
    stops,
    navigationMode,
    travelledDistanceKm,
    totalRouteKm,
    blueRoute,
    roadStyle,
    showRainLayer,
    weatherPoints,
    userLiveCoords,
    convoyParticipants,
    meetingPoints
  ]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !navigationMode || !userLiveCoords) { lastFollowRef.current = null; return; }
    const last = lastFollowRef.current;
    const changed = !last || Math.abs(last[0] - userLiveCoords[0]) + Math.abs(last[1] - userLiveCoords[1]) > 0.00004;
    if (!changed) return;
    if (!last) map.setView(userLiveCoords, 16, { animate: false });
    else if (followUser) map.panTo(userLiveCoords, { animate: true, duration: 0.5 });
    lastFollowRef.current = userLiveCoords;
  }, [navigationMode, userLiveCoords, followUser]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* MAP CANVAS */}
      {tileError && <div role="alert" className="absolute left-3 right-3 top-[75px] z-[65] mx-auto max-w-[310px] rounded-xl border border-amber-200 bg-white/95 p-3 text-center text-xs text-slate-800 shadow-xl">
        O mapa não conseguiu carregar os blocos de imagem. Verifique sua conexão.
        <button type="button" className="ml-2 font-bold text-blue-700 underline" onClick={() => setTileRetryCount(count => count + 1)}>Tentar novamente</button>
      </div>}
      {selectedRoadAlert && <section role="dialog" aria-label="Confirmar ocorrência no mapa"
        className="absolute top-[max(16px,env(safe-area-inset-top))] left-1/2 z-[70] w-[min(330px,calc(100%-24px))] -translate-x-1/2 rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-[0_12px_36px_rgba(15,23,42,.22)] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-amber-700">{ROAD_ALERT_TYPES.find(item => item.id === selectedRoadAlert.kind)?.label}</p>
            <h3 className="mt-1 text-[15px] font-extrabold text-slate-900">Ainda continua lá?</h3>
          </div>
          <button type="button" aria-label="Fechar confirmação de ocorrência" onClick={() => setSelectedRoadAlert(null)}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X size={20}/></button>
        </div>
        {selectedRoadAlert.note && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{selectedRoadAlert.note}</p>}
        {!alertCheckDone && <p className="mt-2 text-[11px] text-slate-500">Confirme somente se estiver perto do local e com o veículo parado.</p>}
        {alertCheckError && <p role="alert" className="mt-2 text-xs text-rose-700">{alertCheckError}</p>}
        {alertCheckMessage && <p role="status" className="mt-2 text-xs text-emerald-700">{alertCheckMessage}</p>}
        {!alertCheckDone && <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={alertCheckBusy} onClick={() => void checkRoadAlert(true)}
            className="min-h-11 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Sim</button>
          <button type="button" disabled={alertCheckBusy} onClick={() => void checkRoadAlert(false)}
            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 disabled:opacity-50">Não</button>
        </div>}
      </section>}
      <div ref={mapContainerRef} className="w-full h-full" />
      {fuel.loading && <p className="absolute bottom-20 left-4 right-4 z-30 text-xs bg-white/95 rounded-xl p-2 shadow">Buscando postos reais...</p>}
      {fuel.error && <div className="absolute bottom-20 left-4 right-4 z-30 text-xs bg-amber-50 rounded-xl p-2 shadow">{fuel.error}<button type="button" onClick={fuel.retry} className="ml-2 font-bold">Tentar novamente</button></div>}
      {selectedToll && <TollModal key={`${selectedToll.id}:${tollSection}`} toll={selectedToll} vehicleType={tollVehicleType || 'car'} initialSection={tollSection} onClose={() => { setSelectedTollId(null); setCatalogToll(null); }} />}
      {selectedPlace && <PlaceModal place={selectedPlace} onClose={() => setSelectedPlace(null)} />}
      {selectedStation && <FuelStationModal key={`${selectedStation}:${stationSection}`} stationId={selectedStation} initialSection={stationSection} onClose={() => setSelectedStation(null)} />}

      {/* MAP STYLE SWITCHER CONTROL (Requirement: Colorido, Satélite, Relevo) */}
      {!navigationMode && !roadStyle && <div className="absolute bottom-5 left-4 z-30">
        <div className="relative">
          <button
            onClick={() => setShowStyleMenu(!showStyleMenu)}
            className="px-3 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-xl text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Alterar visual do mapa"
          >
            <span>{TILE_PROVIDERS[currentStyle].icon}</span>
            <span className="hidden sm:inline">{TILE_PROVIDERS[currentStyle].name}</span>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showStyleMenu && (
            <div className="absolute bottom-11 left-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2 w-52 space-y-1 animate-in fade-in z-40">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 block">
                Camadas do Mapa
              </span>
              {(Object.keys(TILE_PROVIDERS) as MapStyleType[]).map(key => {
                const opt = TILE_PROVIDERS[key];
                const isSelected = currentStyle === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setCurrentStyle(key);
                      setShowStyleMenu(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="flex-1">{opt.name}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
};


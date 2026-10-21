import type {StyleSpecification} from 'maplibre-gl';
import {ROLE_VECTOR_STYLE,ROLE_DARK_VECTOR_STYLE} from './mapVectorStyle';
import type {MapTheme} from './mapAppearance';

export type MapStyleType='light'|'satellite'|'topo';
export const TILE_PROVIDERS: Record<MapStyleType, { name: string; url: string; attribution: string; maxZoom: number; icon: string }> = {
  light: {
    name: 'Claro (MapLibre)',
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

/** Raster bases use the same providers as the hybrid fallback, with explicit
 * 256px tiles and expanded subdomains supported by MapLibre. */
export function standaloneBaseStyle(style:MapStyleType,theme:MapTheme='light'):string|StyleSpecification {
  if(style==='light')return theme==='dark'?ROLE_DARK_VECTOR_STYLE:ROLE_VECTOR_STYLE;
  const provider=TILE_PROVIDERS[style];
  const tiles=provider.url.includes('{s}')
    ? ['a','b','c'].map(subdomain=>provider.url.replace('{s}',subdomain)):[provider.url];
  return {version:8,sources:{'role-raster-base':{type:'raster',tiles,tileSize:256,
    maxzoom:provider.maxZoom,attribution:provider.attribution}},
    layers:[{id:'role-raster-base',type:'raster',source:'role-raster-base'}]};
}

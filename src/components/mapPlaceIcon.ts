import L from 'leaflet';
import type { Place } from '../types/admin';
import {placeIconKind} from '../services/placeIconKind';

// Pictogramas vetoriais. Nada de nomes interpolados em innerHTML ou emojis do sistema.
const paths: Record<string, string> = {
  fuel: '<path d="M3 22V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v18M1 22h15M3 9h11M14 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-3-3"/>',
  toll: '<path d="M4 21v-8h5v8M2 21h9M6 13V8l15-5v4L7 12M11 6l2 3m3-5 2 3M16 13v8m4-8v8"/>',
  theatre: '<path d="M2 3c3 2 6 2 9 0v7c0 3-2 5-4.5 6C4 15 2 13 2 10V3Z"/><path d="M4.3 7h.8m3.1 0H9M4.5 10c1 2 3 2 4 0M12.5 8c3 1.5 6 1.5 9-.5v7c0 3-2 5-4.5 6-2.5-1-4.5-3-4.5-6V8Z"/><path d="M14.5 12h.8m3.2 0h.8m-4.5 5c1-2 3-2 4 0"/>',
  scenic_road: '<path d="M4 22c-4-7 14-8 10-13-2-2-7-3-4-7m4 20c-4-5 10-7 8-13-1-4-6-5-3-7M9 20l1-1m2-5 2-1m3-4V8m-3-4V3"/>',
  restaurant: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3a5 5 0 0 1 5 5v4h-5"/>',
  cafe: '<path d="M4 7h14v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7ZM18 8h2a2 2 0 0 1 0 4h-2M3 21h17"/>',
  supermarket: '<path d="M3 3h2l2 12h12l2-9H6M8 20h.01M18 20h.01"/>',
  shopping: '<rect x="4" y="8" width="16" height="13" rx="2"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  waterfall: '<path d="M5 3h14M8 3v8M12 3v14M16 3v8M4 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  inn: '<path d="M3 20V7m0 9h18v4m0-4v-5a2 2 0 0 0-2-2h-8v7M3 18h18"/><circle cx="7" cy="11" r="2"/>',
  hotel: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5"/>',
  viewpoint: '<path d="m2 20 7-11 4 6 3-4 6 9H2ZM12 3h.01M12 1v1M12 5v1"/>',
  park: '<path d="M9 17a4.5 4.5 0 0 1-4-7 4 4 0 0 1 7-4 4.5 4.5 0 0 1 3 7 4 4 0 0 1-6 4ZM9 13v9m0-6-2-2m2 3 2-2M17 8a3.2 3.2 0 0 1 4 4 3.3 3.3 0 0 1-4 5M18 15v7M3 22h19"/>',
  square: '<path d="m3 16 18-7M3 13v5m18-12v5M9 22l3-9 3 9M7 22h10M5 10v4m14-10v4"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="2" r="1.8"/>',
  museum: '<path d="m3 9 9-6 9 6M4 10h16M5 10v10M10 10v10M15 10v10M20 10v10M3 21h18"/>',
  landmark: '<path d="m12 2 3 4 2 12H7L9 6l3-4ZM5 18h14v4H5v-4ZM11 9h2m-2 4h2"/>',
  historic: '<path d="M3 22V4h3v3h3V4h6v3h3V4h3v18H3ZM8 11v2m8-2v2M9 22v-5a3 3 0 0 1 6 0v5"/>',
  beach: '<path d="M3 20h18M12 18V4M12 4a8 8 0 0 0-8 8c4-2 6-2 8 0 2-2 4-2 8 0a8 8 0 0 0-8-8Z"/>',
  trail: '<circle cx="13" cy="4" r="2"/><path d="m11 8-3 5 4 3-3 6m2-14 5 5h5M12 16l4 6M19 12v10M7 8l-3 6 3 1"/>',
  nature_reserve: '<path d="M12 22V9M12 15C4 15 3 8 5 3c7 0 12 3 12 10M12 18c6 0 9-5 8-10-3 0-6 1-8 4"/>',
  attraction: '<path d="m12 2 2.9 6 6.6 1-4.8 4.7 1.1 6.6L12 17.2l-5.8 3.1 1.1-6.6L2.5 9l6.6-1L12 2Z"/>',
  other: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M9 21v-5h6v5M8 9h2m4 0h2m-8 4h2m4 0h2"/>'
};
const tourist = new Set(['waterfall', 'viewpoint', 'park', 'square', 'museum', 'landmark', 'historic', 'beach', 'trail', 'nature_reserve', 'attraction', 'theatre','scenic_road']);

export function mapPlaceIcon(inputKind: Place['kind'],name=''): L.DivIcon {
  const kind=placeIconKind(inputKind,name);
  const isTourist = tourist.has(kind);
  const bg = isTourist ? '#15803d' :
    kind==='fuel'?'#2563eb':kind==='toll'?'#b7791f':
    kind==='restaurant'||kind==='cafe'?'#ea580c':
    kind==='hotel'||kind==='inn'?'#7c3aed':
    kind==='shopping'||kind==='supermarket'?'#db2777':'#0369a1';
  const root = document.createElement('div');
  root.className = 'rdv-map-place-icon';
  root.dataset.placeKind=kind;
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = `width:38px;height:38px;display:grid;place-items:center;background:${bg};border:2px solid white;border-radius:12px;box-shadow:0 3px 12px #0f172a33;color:white;`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width','23');svg.setAttribute('height','23');svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
  // Somente caminhos SVG constantes, nunca conteúdo de usuário.
  svg.innerHTML = paths[kind] || paths.attraction;
  root.appendChild(svg);
  return L.divIcon({ className:'managed-place-marker', html:root, iconSize:[38,38], iconAnchor:[19,19] });
}

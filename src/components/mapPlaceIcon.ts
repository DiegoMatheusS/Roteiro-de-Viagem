import L from 'leaflet';
import type { Place } from '../types/admin';

// Pictogramas vetoriais. Nada de nomes interpolados em innerHTML ou emojis do sistema.
const paths: Record<string, string> = {
  fuel: '<path d="M3 22V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v18M1 22h15M3 9h11M14 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-3-3"/>',
  toll: '<path d="M5 20 8 4M19 20 16 4M12 4v4m0 4v4m0 4v2M3 21h18"/>',
  theatre: '<path d="M3 4h18v12H3zM8 20h8M12 16v4"/>',
  scenic_road: '<path d="M3 21 9 3m12 18L15 3M12 3v3m0 4v4m0 4v3"/>',
  restaurant: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3a5 5 0 0 1 5 5v4h-5"/>',
  cafe: '<path d="M4 7h14v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7ZM18 8h2a2 2 0 0 1 0 4h-2M3 21h17"/>',
  supermarket: '<path d="M3 3h2l2 12h12l2-9H6M8 20h.01M18 20h.01"/>',
  shopping: '<rect x="4" y="8" width="16" height="13" rx="2"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  waterfall: '<path d="M5 3h14M8 3v8M12 3v14M16 3v8M4 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  inn: '<path d="M3 20V9l9-7 9 7v11M8 20v-7h8v7M3 20h18"/>',
  hotel: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5"/>',
  viewpoint: '<path d="m2 20 7-11 4 6 3-4 6 9H2ZM12 3h.01M12 1v1M12 5v1"/>',
  park: '<path d="M12 2 4 14h4l-3 5h14l-3-5h4L12 2ZM12 19v3"/>',
  museum: '<path d="m3 9 9-6 9 6M4 10h16M5 10v10M10 10v10M15 10v10M20 10v10M3 21h18"/>',
  landmark: '<path d="m12 3 8 5-8 5-8-5 8-5ZM5 13v7M12 13v7M19 13v7M3 21h18"/>',
  historic: '<path d="M4 20V9l8-6 8 6v11H4ZM9 20v-7h6v7"/>',
  beach: '<path d="M3 20h18M12 18V4M12 4a8 8 0 0 0-8 8c4-2 6-2 8 0 2-2 4-2 8 0a8 8 0 0 0-8-8Z"/>',
  trail: '<path d="m3 20 7-12 4 6 3-3 4 9H3ZM8 5h.01M8 2v1"/>',
  nature_reserve: '<path d="M12 22V9M12 15C4 15 3 8 5 3c7 0 12 3 12 10M12 18c6 0 9-5 8-10-3 0-6 1-8 4"/>',
  attraction: '<path d="M12 22s8-6 8-13a8 8 0 1 0-16 0c0 7 8 13 8 13ZM12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>'
};
const tourist = new Set(['waterfall', 'viewpoint', 'park', 'museum', 'landmark', 'historic', 'beach', 'trail', 'nature_reserve', 'attraction', 'theatre','scenic_road']);

export function mapPlaceIcon(kind: Place['kind']): L.DivIcon {
  const isTourist = tourist.has(kind);
  const bg = isTourist ? '#15803d' :
    kind==='fuel'?'#2563eb':kind==='toll'?'#b7791f':
    kind==='restaurant'||kind==='cafe'?'#ea580c':
    kind==='hotel'||kind==='inn'?'#7c3aed':
    kind==='shopping'||kind==='supermarket'?'#db2777':'#0369a1';
  const root = document.createElement('div');
  root.className = 'rdv-map-place-icon';
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

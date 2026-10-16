import L from 'leaflet';

const symbols: Record<string, string> = {
  fuel: '<path d="M3 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2 21h12M3 10h10M13 12h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-3-3"/>',
  toll: '<path d="M3 21V7h7v14M2 7l5-4 5 4M4 11h4M10 12h11M19 8v13M15 10v4"/>',
  restaurant: '<path d="M5 3v7m3-7v7M3 3v5a3 3 0 0 0 6 0V3M6 11v10M19 3c-4 3-4 8 0 8V3Zm0 8v10"/>',
  cafe: '<path d="M4 7h12v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm12 0h2a3 3 0 0 1 0 6h-2M6 3v1m5-1v1"/>',
  hotel: '<path d="M3 18h18M3 21V6m18 15V10H3m4 0V6h10v4"/>',
  park: '<path d="m12 3-7 8h4l-6 6h18l-6-6h4L12 3Zm0 14v4"/>',
  museum: '<path d="m2 8 10-5 10 5H2Zm3 3v7m7-7v7m7-7v7M3 21h18"/>',
  supermarket: '<path d="M3 3h2l3 12h11l3-9H6M9 20h.01M18 20h.01"/>',
  waterfall: '<path d="M3 7h6v7c0 4 6 4 6 0V5h6M3 20c3-3 6 3 9 0s6 3 9 0"/>',
  viewpoint: '<path d="m2 20 7-12 5 7 3-4 5 9H2ZM15 4h.01"/>',
  other: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"/>'
};
const svg = (path: string, size = 22) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export function mapContributionIcon(options: {
  className: string; name: string; kind: string; address?: string; priceLabel?: string;
  onOpen?: () => void; onPrices?: () => void; onComments?: () => void;
}) {
  const root = document.createElement('div');
  root.className = 'map-place-card';
  const button = (label: string, action: () => void, className: string) => {
    const element = document.createElement('button'); element.type = 'button';
    element.className = className; element.setAttribute('aria-label', label); element.title = label;
    element.addEventListener('click', event => { L.DomEvent.stop(event); action(); });
    return element;
  };
  const main = button(`Ver ${options.name}`, options.onOpen || options.onPrices || (() => {}), 'map-place-main');
  const icon = document.createElement('span'); icon.className = 'map-place-symbol';
  const kind = ({ inn: 'hotel', shopping: 'supermarket', nature_reserve: 'park', historic: 'museum', landmark: 'museum', beach: 'waterfall', trail: 'viewpoint' } as Record<string, string>)[options.kind] || options.kind;
  icon.innerHTML = svg(symbols[kind] || symbols.other);
  const name = document.createElement('strong'); name.textContent = options.name;
  main.append(icon, name); root.append(main);
  if (options.address) { main.title = `${options.name} · ${options.address}`; main.setAttribute('aria-label', `Ver ${options.name}`); }
  if (options.priceLabel) {
    const value = document.createElement('div'); value.className = 'map-place-price'; value.textContent = options.priceLabel; root.append(value);
  }
  if (options.onPrices || options.onComments) {
    const actions = document.createElement('div'); actions.className = 'map-place-actions';
    if (options.onPrices) { const price = button('Sugerir preço', options.onPrices, 'map-place-suggest'); price.textContent = 'Sugerir preço'; actions.append(price); }
    if (options.onComments) {
      const comments = button(`Comentários de ${options.name}`, options.onComments, 'map-place-comments');
      comments.innerHTML = svg('<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4Z"/>', 15); actions.append(comments);
    }
    root.append(actions);
  }
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  return L.divIcon({ className: options.className, html: root, iconSize: [152, 40], iconAnchor: [76, 40] });
}

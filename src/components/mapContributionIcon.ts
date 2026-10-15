import L from 'leaflet';

export function mapContributionIcon(options: {
  className: string; name: string; emoji: string; color: string;
  onPrices: () => void; onComments: () => void;
}) {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;font:700 11px system-ui';
  const button = (label: string, action: () => void) => {
    const element = document.createElement('button'); element.type = 'button'; element.setAttribute('aria-label', label); element.title = label;
    element.style.cssText = `display:grid;place-items:center;border:1px solid ${options.color};background:white;color:${options.color};border-radius:8px;min-height:34px;padding:5px 8px;font:inherit;white-space:nowrap;cursor:pointer;box-shadow:0 2px 5px #0002`;
    element.addEventListener('click', event => { L.DomEvent.stop(event); action(); });
    return element;
  };
  const logo = button(`Ver ${options.name}`, options.onPrices);
  logo.innerHTML = `<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${options.emoji === '⛽' ? '<path d="M3 22V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v18M1 22h15M3 9h11M14 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-3-3"/>' : '<path d="m6 3-3 18m15-18 3 18M12 3v3m0 4v4m0 4v3"/>'}</svg>`;
  logo.style.cssText += ';border-radius:50%;width:40px;height:40px;padding:3px;font-size:20px;border-width:2px';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:3px;align-items:center';
  const price = button('Sugerir preço', options.onPrices); price.textContent = 'Sugerir preço';
  const comments = button(`Comentários de ${options.name}`, options.onComments);
  comments.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>';
  actions.append(price, comments); root.append(logo, actions);
  L.DomEvent.disableClickPropagation(root);
  return L.divIcon({ className: options.className, html: root, iconSize: [150, 78], iconAnchor: [75, 20] });
}

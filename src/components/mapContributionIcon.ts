import L from 'leaflet';

export function mapContributionIcon(options: {
  className: string; name: string; emoji: string; color: string;
  onPrices: () => void; onComments: () => void;
}) {
  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;font:700 10px system-ui;min-width:130px';
  const button = (label: string, action: () => void) => {
    const element=document.createElement('button');element.type='button';element.setAttribute('aria-label',label);element.title=label;
    element.style.cssText='display:grid;place-items:center;border:1px solid #bfdbfe;background:white;color:#1d4ed8;border-radius:9px;min-height:28px;padding:4px 7px;font:inherit;cursor:pointer';
    element.addEventListener('click',event=>{L.DomEvent.stop(event);action();});return element;
  };
  const card=document.createElement('div');
  card.style.cssText='background:#fff;border:2px solid #fff;border-radius:12px;box-shadow:0 3px 12px #0004;display:flex;align-items:center;overflow:hidden;max-width:154px';
  const logo=button(`Ver ${options.name}`,options.onPrices);
  logo.innerHTML = `<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${options.emoji === '⛽' ? '<path d="M3 22V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v18M1 22h15M3 9h11M14 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 4 0V9l-3-3"/>' : '<path d="m6 3-3 18m15-18 3 18M12 3v3m0 4v4m0 4v3"/>'}</svg>`;
  logo.style.cssText='display:grid;place-items:center;width:42px;min-width:42px;height:38px;background:#2563eb;color:white;border:0;cursor:pointer';
  const name=document.createElement('span');
  name.textContent=options.name;name.title=options.name;
  name.style.cssText='font:700 10px system-ui;color:#1e293b;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:106px';
  card.append(logo,name);
  const actions=document.createElement('div');actions.style.cssText='display:flex;align-items:center;gap:3px;background:white;padding:2px 3px;border-radius:9px;box-shadow:0 2px 8px #0003';
  const price=button('Sugerir preço',options.onPrices);price.textContent='Sugerir preço';
  const comments=button(`Comentários de ${options.name}`,options.onComments);
  comments.innerHTML='<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></svg>';
  actions.append(price,comments);root.append(card,actions);
  L.DomEvent.disableClickPropagation(root);
  return L.divIcon({ className: options.className, html: root, iconSize: [155, 78], iconAnchor: [77, 22] });
}

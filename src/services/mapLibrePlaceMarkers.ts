import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import L from 'leaflet';
import { mapContributionIcon } from '../components/mapContributionIcon';
import { mapPlaceIcon } from '../components/mapPlaceIcon';
import { toMarkerLngLat, type RoleVectorMarker } from './vectorPlaceData';
import type { Place } from '../types/admin';

export interface RoleMarkerActions {
  onStation: (id:string,section:'prices'|'comments')=>void;
  onToll: (id:string,section:'prices'|'comments',place:Place|null)=>void;
  onPlace: (placeId:string)=>void;
}

/** Preserves the same buttons, labels and accessibility semantics as Leaflet icons. */
function iconElement(icon: L.DivIcon, className: string): HTMLDivElement {
  const root=document.createElement('div');
  root.className=className;
  root.style.cssText='width:max-content;max-width:165px;cursor:pointer;pointer-events:auto;';
  const html=icon.options.html;
  if (html instanceof HTMLElement) root.append(html);
  else if (typeof html === 'string') root.textContent = html; // Never parse untrusted HTML.
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('touchstart',event=>event.stopPropagation(),{passive:true});
  return root;
}

export function addRoleMaplibreMarkers(
  gl: MapLibreMap,
  descriptors: RoleVectorMarker[],
  actions: RoleMarkerActions
): () => void {
  const markers: Marker[]=[];
  for(const entry of descriptors) {
    let root: HTMLDivElement;
    let anchor: 'top'|'center'='top';
    let offset: [number,number]=[0,-22];
    if (entry.kind === 'place') {
      root = iconElement(mapPlaceIcon(entry.category),'managed-place-marker');
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('aria-label',`Ver ${entry.name}`);
      button.title=entry.name;
      button.style.cssText='display:block;padding:0;margin:0;background:transparent;border:0;cursor:pointer;';
      const child=root.firstElementChild;
      if(child) button.append(child);
      root.append(button);
      button.addEventListener('click',event=>{event.stopPropagation();actions.onPlace(entry.id);});
      anchor='center';offset=[0,0];
    } else {
      const isFuel=entry.kind==='fuel';
      const icon=mapContributionIcon({
        className:isFuel?'fuel-station-marker':'toll-marker',
        name:entry.name,emoji:isFuel?'⛽':'🛣️',
        color:isFuel?'#047857':'#0e7490',priceLabel:entry.priceLabel,
        onPrices:()=>isFuel?actions.onStation(entry.id,'prices'):actions.onToll(entry.id,'prices',entry.kind==='toll'?entry.place:null),
        onComments:()=>isFuel?actions.onStation(entry.id,'comments'):actions.onToll(entry.id,'comments',entry.kind==='toll'?entry.place:null)
      });
      root=iconElement(icon,isFuel?'fuel-station-marker':'toll-marker');
      // Clicking the name or approved price also opens the details; inner
      // action buttons have their own handlers and must not trigger twice.
      root.addEventListener('click',event=>{
        if ((event.target as HTMLElement).closest('button')) return;
        event.stopPropagation();
        if (isFuel) actions.onStation(entry.id,'prices');
        else actions.onToll(entry.id,'prices',entry.kind==='toll'?entry.place:null);
      });
    }
    const marker=new Marker({element:root,anchor,offset})
      .setLngLat(toMarkerLngLat(entry.coords))
      .addTo(gl);
    markers.push(marker);
  }
  return () => { for (const marker of markers) marker.remove(); };
}

import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import L from 'leaflet';
import { mapContributionIcon } from '../components/mapContributionIcon';
import { mapPlaceIcon } from '../components/mapPlaceIcon';
import { toMarkerLngLat,validMarkerPosition,rolePlaceMarkerKey,rolePlaceMarkerSignature,type RoleVectorMarker } from './vectorPlaceData';
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

export interface RoleMarkerController {
  update(descriptors: readonly RoleVectorMarker[]):void;
  destroy():void;
}
interface TrackedRoleMarker {
  marker:Marker;
  visualSignature:string;
  coords: [number,number];
}
export function createRoleMaplibreMarkerController(
  gl: MapLibreMap,
  actions: RoleMarkerActions
):RoleMarkerController {
  const markers=new Map<string,TrackedRoleMarker>();
  let destroyed=false;
  const buildMarker=(entry:RoleVectorMarker):Marker=>{
    let root: HTMLDivElement;
    let anchor: 'top'|'center'='top';
    let offset: [number,number]=[0,-22];
    if (entry.kind === 'place') {
      root = iconElement(mapPlaceIcon(entry.category),'managed-place-marker');
      root.title=entry.name;
      root.tabIndex=0;
      root.setAttribute('role','button');
      root.setAttribute('aria-label',`Ver ${entry.name}`);
      root.addEventListener('click',event=>{event.stopPropagation();actions.onPlace(entry.id);});
      root.addEventListener('keydown',event=>{
        if (event.key==='Enter' || event.key===' ') {
          event.preventDefault();event.stopPropagation();actions.onPlace(entry.id);
        }
      });
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
    return marker;
  };
  return {
    update(descriptors){
      if(destroyed)return;
      const wanted=new Map<string,RoleVectorMarker>();
      for(const entry of descriptors){
        if(!entry.id || !validMarkerPosition(entry.coords))continue;
        const key=rolePlaceMarkerKey(entry);
        if(!wanted.has(key))wanted.set(key,entry);
      }
      // First remove stale IDs, then update only changed individual markers.
      for(const [key,record] of markers){
        if(!wanted.has(key)){record.marker.remove();markers.delete(key);}
      }
      for(const [key,entry] of wanted){
        const signature=rolePlaceMarkerSignature(entry);
        const existing=markers.get(key);
        if(existing?.visualSignature===signature){
          if(existing.coords[0]!==entry.coords[0] || existing.coords[1]!==entry.coords[1]){
            existing.marker.setLngLat(toMarkerLngLat(entry.coords));
            existing.coords=[...entry.coords];
          }
          continue;
        }
        // Replace only the marker whose label, price or details changed.
        // Build before removing an existing element to avoid a blank frame.
        const marker=buildMarker(entry);
        existing?.marker.remove();
        markers.set(key,{marker,visualSignature:signature,coords:[...entry.coords]});
      }
    },
    destroy(){
      if(destroyed)return;
      destroyed=true;
      for(const record of markers.values())record.marker.remove();
      markers.clear();
    }
  };
}

/** Backward-compatible one-shot entry point for callers outside the map. */
export function addRoleMaplibreMarkers(
  gl: MapLibreMap,
  descriptors: RoleVectorMarker[],
  actions: RoleMarkerActions
): () => void {
  const controller=createRoleMaplibreMarkerController(gl,actions);
  try{controller.update(descriptors);}
  catch(error){controller.destroy();throw error;}
  return ()=>controller.destroy();
}

import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import L from 'leaflet';
import { mapPlaceIcon } from '../components/mapPlaceIcon';
import { toMarkerLngLat,validMarkerPosition,rolePlaceMarkerKey,rolePlaceMarkerSignature,
  type RoleVectorMarker } from './vectorPlaceData';
import {nearestPoiToExpand,poiAccent,poiCategory,poiVisibleAtZoom,
  type PoiVisibilityContext} from './mapPoiPresentation';
import type { Place } from '../types/admin';
import '../role-map-poi.css';

export interface RoleMarkerActions {
  onStation: (id:string,section:'prices'|'comments')=>void;
  onToll: (id:string,section:'prices'|'comments',place:Place|null)=>void;
  onPlace: (placeId:string)=>void;
}

/** Leaflet-generated SVG glyphs are DOM nodes, never HTML derived from user data. */
function iconElement(icon: L.DivIcon, className: string): HTMLDivElement {
  const root=document.createElement('div');
  root.className=className;
  root.style.cssText='width:max-content;max-width:165px;cursor:pointer;pointer-events:auto;';
  const html=icon.options.html;
  if (html instanceof HTMLElement) root.append(html);
  else if (typeof html === 'string') root.textContent = html;
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('touchstart',event=>event.stopPropagation(),{passive:true});
  return root;
}

export interface RoleMarkerController {
  update(descriptors: readonly RoleVectorMarker[],context?:PoiVisibilityContext):void;
  setContext(context:PoiVisibilityContext):void;
  destroy():void;
}
interface TrackedRoleMarker {
  marker:Marker;
  visualSignature:string;
  coords: [number,number];
  entry:RoleVectorMarker;
}
export function createRoleMaplibreMarkerController(
  gl: MapLibreMap,
  actions: RoleMarkerActions
):RoleMarkerController {
  const markers=new Map<string,TrackedRoleMarker>();
  let destroyed=false;
  let context:PoiVisibilityContext={zoom:gl.getZoom(),navigationMode:false};
  let manualKey:string|null=null;
  const openDetails=(entry:RoleVectorMarker)=>{
    if(entry.kind==='place')actions.onPlace(entry.id);
    else if(entry.kind==='fuel')actions.onStation(entry.id,'prices');
    else actions.onToll(entry.id,'prices',entry.place);
  };
  const applyVisibility=()=>{
    if(destroyed)return;
    const entries=[...markers.values()].map(record=>record.entry);
    const nearest=nearestPoiToExpand(entries,{...context,zoom:gl.getZoom()});
    for(const [key,record] of markers){
      const visible=poiVisibleAtZoom(record.entry,gl.getZoom()) ||
        (Boolean(context.showRouteServices) && (record.entry.kind==='fuel'||record.entry.kind==='toll'));
      const element=record.marker.getElement();
      element.style.display=visible?'':'none';
      element.dataset.expanded=String(visible && (manualKey===key || (!manualKey&&key===nearest)));
      element.setAttribute('aria-expanded',element.dataset.expanded);
    }
  };
  const buildMarker=(entry:RoleVectorMarker):Marker=>{
    const category=poiCategory(entry);
    const color=poiAccent(category);
    const root=iconElement(mapPlaceIcon(category as Place['kind']),'role-poi-marker managed-place-marker');
    root.style.setProperty('--role-poi-accent',color);
    root.dataset.expanded='false';
    root.dataset.poiCategory=category;
    root.title=entry.name;
    root.tabIndex=0;
    root.setAttribute('role','button');
    root.setAttribute('aria-label',`Ver ${entry.name}`);

    const details=document.createElement('div');
    details.className='role-poi-details';
    const heading=document.createElement('strong');
    heading.className='role-poi-name';heading.textContent=entry.name;
    details.append(heading);
    if(entry.kind==='place' && entry.description){
      const desc=document.createElement('span');
      desc.className='role-poi-description';
      desc.textContent=entry.description;details.append(desc);
    }
    if(entry.kind!=='place' && entry.priceLabel){
      const price=document.createElement('span');price.className='role-poi-price';
      price.textContent=entry.priceLabel;details.append(price);
    }
    if(entry.kind==='fuel'||entry.kind==='toll'){
      const actionsRow=document.createElement('div');actionsRow.className='role-poi-actions';
      const action=(label:string,run:()=>void)=>{
        const button=document.createElement('button');
        button.type='button';button.className='role-poi-action';
        button.textContent=label;button.setAttribute('aria-label',`${label}: ${entry.name}`);
        button.addEventListener('click',event=>{event.stopPropagation();run();});
        actionsRow.append(button);
      };
      action('Sugerir preço',()=>openDetails(entry));
      action('Comentários',()=>entry.kind==='fuel'
        ?actions.onStation(entry.id,'comments')
        :actions.onToll(entry.id,'comments',entry.kind==='toll'?entry.place:null));
      details.append(actionsRow);
    }
    root.append(details);
    const key=rolePlaceMarkerKey(entry);
    const activate=(event:Event)=>{
      if((event.target as HTMLElement).closest('button'))return;
      event.stopPropagation();
      if(root.dataset.expanded==='true'){
        openDetails(entry);
      }else{
        manualKey=key;applyVisibility();
      }
    };
    root.addEventListener('click',activate);
    root.addEventListener('keydown',event=>{
      // Keyboard Enter should open the place in one action, rather than merely
      // expanding a visual card. Space keeps the explicit expand interaction.
      if(event.target!==root)return;
      if(event.key==='Enter'){
        event.preventDefault();event.stopPropagation();openDetails(entry);
      }else if(event.key===' '){
        event.preventDefault();activate(event);
      }else if(event.key==='Escape'&&manualKey===key){
        event.preventDefault();manualKey=null;applyVisibility();
      }
    });
    const anchor:'center'='center',offset:[number,number]=[0,0];
    const marker=new Marker({element:root,anchor,offset})
      .setLngLat(toMarkerLngLat(entry.coords)).addTo(gl);
    return marker;
  };
  const onZoom=()=>applyVisibility();
  gl.on('zoomend',onZoom);
  return {
    update(descriptors,inputs){
      if(destroyed)return;
      if(inputs)context=inputs;
      const wanted=new Map<string,RoleVectorMarker>();
      for(const entry of descriptors){
        if(!entry.id||!validMarkerPosition(entry.coords))continue;
        const key=rolePlaceMarkerKey(entry);
        if(!wanted.has(key))wanted.set(key,entry);
      }
      for(const [key,record] of markers){
        if(!wanted.has(key)){record.marker.remove();markers.delete(key);}
      }
      if(manualKey&&!wanted.has(manualKey))manualKey=null;
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
        const marker=buildMarker(entry);
        existing?.marker.remove();
        markers.set(key,{marker,visualSignature:signature,coords:[...entry.coords],entry});
      }
      applyVisibility();
    },
    setContext(inputs){context=inputs;applyVisibility();},
    destroy(){
      if(destroyed)return;
      destroyed=true;
      gl.off('zoomend',onZoom);
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

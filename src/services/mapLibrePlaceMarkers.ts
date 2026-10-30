import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import L from 'leaflet';
import { mapPlaceIcon } from '../components/mapPlaceIcon';
import { toMarkerLngLat,validMarkerPosition,rolePlaceMarkerKey,rolePlaceMarkerSignature,
  type RoleVectorMarker } from './vectorPlaceData';
import {poiCategory,poiVisibleAtZoom,type PoiVisibilityContext} from './mapPoiPresentation';
import type { Place } from '../types/admin';
import '../role-map-poi.css';

export interface RoleMarkerActions {
  onStation: (id:string,section:'prices'|'comments',mode?:'view'|'edit')=>void;
  onToll: (id:string,section:'prices'|'comments',place:Place|null)=>void;
  onPlace: (placeId:string)=>void;
}

/** Leaflet-generated SVG glyphs are DOM nodes, never HTML derived from user data. */
function iconElement(icon: L.DivIcon, className: string): HTMLDivElement {
  const root=document.createElement('div');
  root.className=className;
  root.style.cssText='width:38px;height:38px;cursor:pointer;pointer-events:auto;';
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
  // Last values written to the element. GPS fixes call applyVisibility many
  // times a minute; rewriting identical attributes on every marker restyles the
  // whole overlay and competes with the user's pan and zoom gestures.
  visible:boolean|null;
}
export function createRoleMaplibreMarkerController(
  gl: MapLibreMap,
  actions: RoleMarkerActions
):RoleMarkerController {
  const markers=new Map<string,TrackedRoleMarker>();
  let destroyed=false;
  let context:PoiVisibilityContext={zoom:gl.getZoom(),navigationMode:false};
  const openDetails=(entry:RoleVectorMarker)=>{
    if(entry.kind==='place')actions.onPlace(entry.id);
    else if(entry.kind==='fuel')actions.onStation(entry.id,'prices');
    else actions.onToll(entry.id,'prices',entry.place);
  };
  const applyVisibility=()=>{
    if(destroyed)return;
    const zoom=gl.getZoom();
    for(const record of markers.values()){
      const visible=poiVisibleAtZoom(record.entry,zoom) ||
        (Boolean(context.showRouteServices) && (record.entry.kind==='fuel'||record.entry.kind==='toll'));
      const element=record.marker.getElement();
      if(record.visible!==visible){
        record.visible=visible;
        element.style.display=visible?'':'none';
      }
    }
  };
  const buildMarker=(entry:RoleVectorMarker):Marker=>{
    const category=poiCategory(entry);
    const root=iconElement(mapPlaceIcon(category as Place['kind']),'role-poi-marker managed-place-marker');
    root.dataset.poiCategory=category;
    root.dataset.poiKind=entry.kind;
    root.dataset.poiId=entry.id;
    root.tabIndex=0;
    root.setAttribute('role','button');
    root.setAttribute('aria-label',`Ver ${entry.name}`);

    const key=rolePlaceMarkerKey(entry);
    const activate=(event:Event)=>{
      event.stopPropagation();
      // The pin stays compact. Read live metadata without rebuilding its DOM
      // when a price, description or registered coordinate changes.
      const current=markers.get(key)?.entry;
      if(current)openDetails(current);
    };
    root.addEventListener('click',activate);
    root.addEventListener('keydown',event=>{
      if(event.target!==root)return;
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();activate(event);
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
      for(const [key,entry] of wanted){
        const signature=rolePlaceMarkerSignature(entry);
        const existing=markers.get(key);
        if(existing?.visualSignature===signature){
          if(existing.coords[0]!==entry.coords[0] || existing.coords[1]!==entry.coords[1]){
            existing.marker.setLngLat(toMarkerLngLat(entry.coords));
            existing.coords=[...entry.coords];
          }
          // Keep the same marker and the metadata used by its click handler.
          existing.entry=entry;
          continue;
        }
        const marker=buildMarker(entry);
        existing?.marker.remove();
        markers.set(key,{marker,visualSignature:signature,coords:[...entry.coords],entry,
          visible:null});
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

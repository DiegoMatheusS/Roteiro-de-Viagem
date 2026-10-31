import { Marker, Popup, type Map as MapLibreMap } from 'maplibre-gl';
import L from 'leaflet';
import { mapPlaceIcon } from '../components/mapPlaceIcon';
import { toMarkerLngLat,validMarkerPosition,rolePlaceMarkerKey,rolePlaceMarkerSignature,
  type RoleVectorMarker } from './vectorPlaceData';
import {poiCategory,type PoiVisibilityContext} from './mapPoiPresentation';
import {selectVisiblePois} from './poiDensity';
import {bindMapMarkerActivation} from './mapMarkerActivation';
import type { Place } from '../types/admin';
import '../role-map-poi.css';
import {createPlaceBalloon,placeBalloonSignature,type RoleMarkerActions} from './placeBalloon';
export type {RoleMarkerActions} from './placeBalloon';

/** Leaflet-generated SVG glyphs are DOM nodes, never HTML derived from user data. */
function iconElement(icon: L.DivIcon, className: string): HTMLDivElement {
  const root=document.createElement('div');
  root.className=className;
  root.style.cssText='width:38px;height:38px;cursor:pointer;pointer-events:auto;';
  const html=icon.options.html;
  if (html instanceof HTMLElement) root.append(html);
  else if (typeof html === 'string') root.textContent = html;
  return root;
}

export interface RoleMarkerController {
  update(descriptors: readonly RoleVectorMarker[],context?:PoiVisibilityContext):void;
  setContext(context:PoiVisibilityContext):void;
  visibleKeys():ReadonlySet<string>;
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
  size:number;
  unbind:()=>void;
}
export function createRoleMaplibreMarkerController(
  gl: MapLibreMap,
  actions: RoleMarkerActions
):RoleMarkerController {
  const markers=new Map<string,TrackedRoleMarker>();
  let destroyed=false;
  let context:PoiVisibilityContext={zoom:gl.getZoom(),navigationMode:false};
  let visibleKeys=new Set<string>(),frame:number|null=null;
  let layoutDirty=true,lastView='';
  let active:{key:string;popup:Popup;content:ReturnType<typeof createPlaceBalloon>;signature:string}|null=null;
  const closeBalloon=()=>{active?.popup.remove();};
  const closeOnBack=(event:Event)=>{
    if(!active)return;event.preventDefault();event.stopImmediatePropagation();closeBalloon();
  };
  window.addEventListener('rdv:close-overlay',closeOnBack,true);
  const openBalloon=(entry:RoleVectorMarker)=>{
    const key=rolePlaceMarkerKey(entry);
    if(active?.key===key){closeBalloon();return;}
    closeBalloon();
    const content=createPlaceBalloon(entry,actions,closeBalloon);
    const popup=new Popup({className:'role-place-balloon-popup',offset:22,maxWidth:'300px',focusAfterOpen:false})
      .setLngLat(toMarkerLngLat(entry.coords)).setDOMContent(content.element).addTo(gl);
    const record={key,popup,content,signature:placeBalloonSignature(entry)};
    active=record;markers.get(key)?.marker.getElement().setAttribute('aria-expanded','true');
    popup.on('close',()=>{
      record.content.dispose();
      markers.get(key)?.marker.getElement().setAttribute('aria-expanded','false');
      if(active===record)active=null;
    });
  };
  const applyVisibility=()=>{
    if(destroyed)return;
    const box=gl.getContainer(),center=gl.getCenter();
    const viewKey=JSON.stringify([gl.getZoom(),center.lng,center.lat,gl.getBearing(),gl.getPitch(),
      box.clientWidth,box.clientHeight,context.navigationMode,context.showRouteServices,active?.key]);
    if(!layoutDirty&&viewKey===lastView)return;
    layoutDirty=false;lastView=viewKey;
    const layout=selectVisiblePois([...markers.values()].map(record=>record.entry),{
      zoom:gl.getZoom(),width:box.clientWidth,height:box.clientHeight,
      project:coords=>gl.project(toMarkerLngLat(coords)),navigationMode:context.navigationMode,
      showRouteServices:context.showRouteServices,selectedKey:active?.key
    });
    visibleKeys=layout.keys;
    for(const record of markers.values()){
      const visible=visibleKeys.has(rolePlaceMarkerKey(record.entry));
      const element=record.marker.getElement();
      if(record.visible!==visible){
        record.visible=visible;
        element.style.display=visible?'':'none';
      }
      if(record.size!==layout.size){record.size=layout.size;element.style.setProperty('--role-poi-scale',String(layout.size/38));}
      if(!visible&&active?.key===rolePlaceMarkerKey(record.entry))closeBalloon();
    }
  };
  const buildMarker=(entry:RoleVectorMarker):{marker:Marker;unbind:()=>void}=>{
    const category=poiCategory(entry);
    // Keep the registered name for legacy category-specific glyphs too.
    const iconKind=entry.kind==='place'?entry.category:category as Place['kind'];
    const root=iconElement(mapPlaceIcon(iconKind,entry.name),'role-poi-marker managed-place-marker');
    root.dataset.poiCategory=category;
    root.dataset.poiKind=entry.kind;
    root.dataset.poiId=entry.id;
    root.tabIndex=0;
    root.setAttribute('role','button');
    root.setAttribute('aria-label',`Ver ${entry.name}`);
    root.setAttribute('aria-expanded','false');

    const key=rolePlaceMarkerKey(entry);
    const activate=()=>{
      // The pin stays compact. Read live metadata without rebuilding its DOM
      // when a price, description or registered coordinate changes.
      const current=markers.get(key)?.entry;
      if(current)openBalloon(current);
    };
    const unbind=bindMapMarkerActivation(root,activate);
    const anchor:'center'='center',offset:[number,number]=[0,0];
    const marker=new Marker({element:root,anchor,offset})
      .setLngLat(toMarkerLngLat(entry.coords)).addTo(gl);
    return {marker,unbind};
  };
  let lastLayoutAt=-Infinity;
  const schedule=()=>{
    if(frame!==null||performance.now()-lastLayoutAt<80)return;
    frame=requestAnimationFrame(()=>{frame=null;lastLayoutAt=performance.now();applyVisibility();});
  };
  gl.on('move',schedule);gl.on('moveend',applyVisibility);gl.on('resize',applyVisibility);
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
        if(!wanted.has(key)){if(active?.key===key)closeBalloon();record.unbind();record.marker.remove();markers.delete(key);layoutDirty=true;}
      }
      for(const [key,entry] of wanted){
        const signature=rolePlaceMarkerSignature(entry);
        const existing=markers.get(key);
        if(existing?.visualSignature===signature){
          if(existing.coords[0]!==entry.coords[0] || existing.coords[1]!==entry.coords[1]){
            layoutDirty=true;
            existing.marker.setLngLat(toMarkerLngLat(entry.coords));
            existing.coords=[...entry.coords];
          }
          if(existing.entry.routeService!==entry.routeService)layoutDirty=true;
          // Keep the same marker and the metadata used by its click handler.
          existing.entry=entry;
          if(active?.key===key){
            active.popup.setLngLat(toMarkerLngLat(entry.coords));
            const contentSignature=placeBalloonSignature(entry);
            if(active.signature!==contentSignature){
              active.content.dispose();active.content=createPlaceBalloon(entry,actions,closeBalloon);
              active.popup.setDOMContent(active.content.element);active.signature=contentSignature;
            }
          }
          continue;
        }
        const {marker,unbind}=buildMarker(entry);
        if(active?.key===key)closeBalloon();
        existing?.marker.remove();
        existing?.unbind();layoutDirty=true;
        markers.set(key,{marker,visualSignature:signature,coords:[...entry.coords],entry,
          visible:null,size:0,unbind});
      }
      applyVisibility();
    },
    setContext(inputs){context=inputs;applyVisibility();},
    visibleKeys(){return visibleKeys;},
    destroy(){
      if(destroyed)return;
      destroyed=true;
      window.removeEventListener('rdv:close-overlay',closeOnBack,true);
      closeBalloon();
      gl.off('move',schedule);gl.off('moveend',applyVisibility);gl.off('resize',applyVisibility);
      if(frame!==null)cancelAnimationFrame(frame);
      for(const record of markers.values()){record.unbind();record.marker.remove();}
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

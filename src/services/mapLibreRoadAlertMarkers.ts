import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { RoadAlert } from '../types/roadAlerts';
import { ROAD_ALERT_TYPES } from '../types/roadAlerts';
import { createRoadAlertIconElement, roadAlertMarkerChange, selectVisibleRoadAlerts } from './mapRoadAlerts';

export interface RoadAlertPinController {
  update(alerts: readonly RoadAlert[]):void;
  destroy():void;
}
interface TrackedRoadAlert {
  marker: Marker;
  alert: RoadAlert;
}

/** Keep existing alert buttons mounted when only an unrelated occurrence is
 * approved, confirmed or removed. No camera/zoom changes are ever issued.
 */
export function createRoleMaplibreRoadAlertController(
  map: MapLibreMap,
  onSelect: (alert: RoadAlert) => void
): RoadAlertPinController {
  const markers = new Map<string,TrackedRoadAlert>();
  let destroyed=false;
  const makeMarker=(alert:RoadAlert):Marker=>{
    const label=ROAD_ALERT_TYPES.find(type=>type.id===alert.kind)?.label||'Ocorrência';
    const button=document.createElement('button');
    button.type='button';
    button.className='road-alert-marker rdv-maplibre-road-alert';
    button.setAttribute('aria-label',`${label}. Confirmar se ainda está no local`);
    button.title=label;
    button.style.cssText='display:block;padding:0;background:transparent;border:0;cursor:pointer;';
    button.append(createRoadAlertIconElement(alert.kind));
    for(const type of ['click','dblclick','mousedown','touchstart','pointerdown'] as const){
      button.addEventListener(type,event=>event.stopPropagation(),{passive:true});
    }
    button.addEventListener('click',event=>{
      event.stopPropagation();
      // Use the latest approved report: note/expiry may change without
      // re-creating the marker or losing focus.
      onSelect(markers.get(alert.id)?.alert??alert);
    });
    return new Marker({element:button,anchor:'center'})
      .setLngLat([alert.lng,alert.lat]).addTo(map);
  };
  return {
    update(alerts){
      if(destroyed)return;
      const visible=selectVisibleRoadAlerts(alerts);
      const wanted=new Set(visible.map(alert=>alert.id));
      for(const [id,record] of markers){
        if(!wanted.has(id)){record.marker.remove();markers.delete(id);}
      }
      for(const alert of visible){
        const record=markers.get(alert.id);
        const change=roadAlertMarkerChange(record?.alert||null,alert);
        if(change==='keep'){
          record!.alert=alert;
        }else if(change==='move'){
          record!.marker.setLngLat([alert.lng,alert.lat]);
          record!.alert=alert;
        }else{
          // Build first. If WebGL or the DOM fails, leave the old marker
          // intact until the caller can switch back to raster.
          const marker=makeMarker(alert);
          record?.marker.remove();
          markers.set(alert.id,{alert,marker});
        }
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

/** Compatibility for one-shot renderers. */
export function addRoleMaplibreRoadAlerts(
  map:MapLibreMap,
  alerts:readonly RoadAlert[],
  onSelect:(alert:RoadAlert)=>void
):()=>void {
  const controller=createRoleMaplibreRoadAlertController(map,onSelect);
  try{controller.update(alerts);}
  catch(error){controller.destroy();throw error;}
  return ()=>controller.destroy();
}

import L from 'leaflet';
import {mapPlaceIcon} from '../components/mapPlaceIcon';
import {rolePlaceMarkerKey,rolePlaceMarkerSignature,validMarkerPosition,type RoleVectorMarker} from './vectorPlaceData';
import {bindLeafletPlaceBalloon} from './leafletPlaceBalloon';
import type {RoleMarkerActions} from './placeBalloon';

/** Preserve pins and the selected balloon through viewport/price refreshes. */
export function createLeafletPlaceMarkerController(map:L.Map,actions:RoleMarkerActions){
  const group=L.layerGroup().addTo(map);
  const records=new Map<string,{marker:L.Marker;signature:string;coords:[number,number];balloon:ReturnType<typeof bindLeafletPlaceBalloon>}>();
  let destroyed=false;
  const closeOnBack=(event:Event)=>{
    for(const record of records.values())if(record.marker.isPopupOpen()){
      event.preventDefault();event.stopImmediatePropagation();record.marker.closePopup();return;
    }
  };
  window.addEventListener('rdv:close-overlay',closeOnBack,true);
  const remove=(key:string)=>{const record=records.get(key);if(record){record.balloon.dispose();group.removeLayer(record.marker);records.delete(key);}};
  return {
    update(entries:readonly RoleVectorMarker[]){
      if(destroyed)return;
      const desired=new Map(entries.filter(entry=>validMarkerPosition(entry.coords)).map(entry=>[rolePlaceMarkerKey(entry),entry]));
      for(const key of records.keys())if(!desired.has(key))remove(key);
      for(const [key,entry] of desired){
        const signature=rolePlaceMarkerSignature(entry),record=records.get(key);
        if(record?.signature===signature){
          if(record.coords[0]!==entry.coords[0]||record.coords[1]!==entry.coords[1]){
            record.marker.setLatLng(entry.coords);record.coords=[...entry.coords];
          }
          record.balloon.update(entry);continue;
        }
        remove(key);
        const category=entry.kind==='place'?entry.category:entry.kind;
        const marker=L.marker(entry.coords,{icon:mapPlaceIcon(category,entry.name),keyboard:true,
          zIndexOffset:entry.kind==='toll'?1700:entry.kind==='fuel'?1500:1400,riseOnHover:true}).addTo(group);
        const element=marker.getElement();
        if(element){element.dataset.poiId=entry.id;element.classList.add(entry.kind==='fuel'?'fuel-station-marker':entry.kind==='toll'?'toll-marker':'registered-place-marker');}
        records.set(key,{marker,signature,coords:[...entry.coords],balloon:bindLeafletPlaceBalloon(marker,entry,actions)});
      }
    },
    destroy(){if(destroyed)return;destroyed=true;window.removeEventListener('rdv:close-overlay',closeOnBack,true);for(const key of records.keys())remove(key);group.remove();}
  };
}

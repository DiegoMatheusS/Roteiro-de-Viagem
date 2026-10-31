import L from 'leaflet';
import {mapPlaceIcon} from '../components/mapPlaceIcon';
import {rolePlaceMarkerKey,rolePlaceMarkerSignature,validMarkerPosition,type RoleVectorMarker} from './vectorPlaceData';
import {bindLeafletPlaceBalloon} from './leafletPlaceBalloon';
import type {RoleMarkerActions} from './placeBalloon';
import type {PoiVisibilityContext} from './mapPoiPresentation';
import {selectVisiblePois} from './poiDensity';

/** Preserve pins and the selected balloon through viewport/price refreshes. */
export function createLeafletPlaceMarkerController(map:L.Map,actions:RoleMarkerActions){
  const group=L.layerGroup().addTo(map);
  const records=new Map<string,{marker:L.Marker;entry:RoleVectorMarker;signature:string;coords:[number,number];balloon:ReturnType<typeof bindLeafletPlaceBalloon>;visible:boolean|null;size:number}>();
  let destroyed=false;
  let context:PoiVisibilityContext={zoom:map.getZoom(),navigationMode:false};
  let visibleKeys=new Set<string>(),frame:number|null=null;
  const applyVisibility=()=>{
    if(destroyed)return;
    const size=map.getSize();
    const selected=[...records].find(([,record])=>record.marker.isPopupOpen())?.[0];
    const layout=selectVisiblePois([...records.values()].map(record=>record.entry),{
      zoom:map.getZoom(),width:size.x,height:size.y,project:coords=>map.latLngToContainerPoint(coords),
      navigationMode:context.navigationMode,showRouteServices:context.showRouteServices,selectedKey:selected
    });
    visibleKeys=layout.keys;
    for(const [key,record] of records){
      const element=record.marker.getElement();if(!element)continue;
      const visible=visibleKeys.has(key);
      if(record.visible!==visible){record.visible=visible;element.style.display=visible?'':'none';}
      if(record.size!==layout.size){record.size=layout.size;element.style.setProperty('--role-poi-scale',String(layout.size/38));}
      if(!visible&&record.marker.isPopupOpen())record.marker.closePopup();
    }
  };
  let lastLayoutAt=-Infinity;
  const schedule=()=>{
    if(frame!==null||performance.now()-lastLayoutAt<80)return;
    frame=requestAnimationFrame(()=>{frame=null;lastLayoutAt=performance.now();applyVisibility();});
  };
  map.on('zoom move',schedule);map.on('moveend resize',applyVisibility);
  const closeOnBack=(event:Event)=>{
    for(const record of records.values())if(record.marker.isPopupOpen()){
      event.preventDefault();event.stopImmediatePropagation();record.marker.closePopup();return;
    }
  };
  window.addEventListener('rdv:close-overlay',closeOnBack,true);
  const remove=(key:string)=>{const record=records.get(key);if(record){record.balloon.dispose();group.removeLayer(record.marker);records.delete(key);}};
  return {
    update(entries:readonly RoleVectorMarker[],inputs?:PoiVisibilityContext){
      if(destroyed)return;
      if(inputs)context=inputs;
      const desired=new Map(entries.filter(entry=>validMarkerPosition(entry.coords)).map(entry=>[rolePlaceMarkerKey(entry),entry]));
      for(const key of records.keys())if(!desired.has(key))remove(key);
      for(const [key,entry] of desired){
        const signature=rolePlaceMarkerSignature(entry),record=records.get(key);
        if(record?.signature===signature){
          if(record.coords[0]!==entry.coords[0]||record.coords[1]!==entry.coords[1]){
            record.marker.setLatLng(entry.coords);record.coords=[...entry.coords];
          }
          record.entry=entry;record.balloon.update(entry);continue;
        }
        remove(key);
        const category=entry.kind==='place'?entry.category:entry.kind;
        const marker=L.marker(entry.coords,{icon:mapPlaceIcon(category,entry.name),keyboard:true,
          zIndexOffset:entry.kind==='toll'?1700:entry.kind==='fuel'?1500:1400,riseOnHover:true}).addTo(group);
        const element=marker.getElement();
        if(element){element.dataset.poiId=entry.id;element.classList.add(entry.kind==='fuel'?'fuel-station-marker':entry.kind==='toll'?'toll-marker':'registered-place-marker');}
        records.set(key,{marker,entry,signature,coords:[...entry.coords],balloon:bindLeafletPlaceBalloon(marker,entry,actions),visible:null,size:0});
      }
      applyVisibility();
    },
    setContext(inputs:PoiVisibilityContext){
      const changed=inputs.navigationMode!==context.navigationMode||inputs.showRouteServices!==context.showRouteServices;
      context=inputs;if(changed)applyVisibility();
    },
    visibleKeys(){return visibleKeys;},
    destroy(){if(destroyed)return;destroyed=true;window.removeEventListener('rdv:close-overlay',closeOnBack,true);
      map.off('zoom move',schedule);map.off('moveend resize',applyVisibility);if(frame!==null)cancelAnimationFrame(frame);
      for(const key of records.keys())remove(key);group.remove();}
  };
}

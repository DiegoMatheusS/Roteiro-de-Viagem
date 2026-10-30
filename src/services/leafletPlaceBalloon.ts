import L from 'leaflet';
import type {RoleVectorMarker} from './vectorPlaceData';
import {createPlaceBalloon,placeBalloonSignature,type RoleMarkerActions} from './placeBalloon';

/** Same selected balloon in the raster fallback, anchored by Leaflet itself. */
export function bindLeafletPlaceBalloon(marker:L.Marker,entry:RoleVectorMarker,actions:RoleMarkerActions){
  const element=marker.getElement();let content:ReturnType<typeof createPlaceBalloon>|null=null;
  let current=entry,signature=placeBalloonSignature(entry);
  element?.setAttribute('aria-label',`Ver ${entry.name}`);
  element?.setAttribute('aria-expanded','false');
  if(element){L.DomEvent.disableClickPropagation(element);}
  marker.bindPopup(()=>{
    content?.dispose();
    content=createPlaceBalloon(current,actions,()=>marker.closePopup());return content.element;
  },{className:'role-place-balloon-popup',offset:[0,-20],minWidth:276,maxWidth:300,autoPan:true,autoPanPadding:[16,16]});
  marker.on('popupopen',()=>element?.setAttribute('aria-expanded','true'));
  const dispose=()=>{content?.dispose();content=null;element?.setAttribute('aria-expanded','false');};
  marker.on('popupclose',dispose);marker.on('remove',dispose);
  // Leaflet delegates marker clicks through the map. Own activation locally so
  // it cannot also choose a destination or close/reopen the same popup.
  element?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();marker.togglePopup();});
  element?.addEventListener('keydown',event=>{
    if(event.target!==element||(event.key!=='Enter'&&event.key!==' '))return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)marker.togglePopup();
  });
  element?.addEventListener('keypress',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  return {
    update(next:RoleVectorMarker){
      current=next;const nextSignature=placeBalloonSignature(next);
      if(nextSignature!==signature){signature=nextSignature;marker.getPopup()?.update();}
    },
    dispose
  };
}

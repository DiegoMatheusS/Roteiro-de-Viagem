import L from 'leaflet';
import type {RoleVectorMarker} from './vectorPlaceData';
import {createPlaceBalloon,visibleMapBottom,placeBalloonSignature,type RoleMarkerActions} from './placeBalloon';
import {bindMapMarkerActivation} from './mapMarkerActivation';

/** Same selected balloon in the raster fallback, anchored by Leaflet itself. */
export function bindLeafletPlaceBalloon(map:L.Map,marker:L.Marker,entry:RoleVectorMarker,actions:RoleMarkerActions){
  const element=marker.getElement();let content:ReturnType<typeof createPlaceBalloon>|null=null;
  let current=entry,signature=placeBalloonSignature(entry);
  element?.setAttribute('aria-label',`Ver ${entry.name}`);
  element?.setAttribute('aria-expanded','false');
  marker.bindPopup(()=>{
    const container = map.getContainer();
    const coveredHeight = container.getBoundingClientRect().bottom - visibleMapBottom(container);
    const popup = marker.getPopup();
    if (popup) popup.options.autoPanPaddingBottomRight = L.point(16, 16 + coveredHeight);
    content?.dispose();
    content=createPlaceBalloon(current,actions,()=>marker.closePopup());return content.element;
  },{className:'role-place-balloon-popup',offset:[0,-20],minWidth:276,maxWidth:300,autoPan:true,autoPanPadding:[16,16]});
  marker.on('popupopen',()=>element?.setAttribute('aria-expanded','true'));
  const dispose=()=>{content?.dispose();content=null;element?.setAttribute('aria-expanded','false');};
  marker.on('popupclose',dispose);marker.on('remove',dispose);
  const unbind=element?bindMapMarkerActivation(element,()=>marker.togglePopup()):()=>{};
  return {
    setIconSize(size:number){
      const popup=marker.getPopup();
      if(!popup)return;
      popup.options.offset=[0,-Math.max(20,size/2+1)];
      if(marker.isPopupOpen())popup.update();
    },
    update(next:RoleVectorMarker){
      current=next;const nextSignature=placeBalloonSignature(next);
      if(nextSignature!==signature){signature=nextSignature;marker.getPopup()?.update();}
    },
    dispose(){unbind();dispose();}
  };
}

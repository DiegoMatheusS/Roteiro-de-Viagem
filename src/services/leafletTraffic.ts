import L from 'leaflet';
import {TRAFFIC_MIN_ZOOM,type TrafficMapPort} from './trafficFlow';

export function createLeafletTrafficPort(map:L.Map):TrafficMapPort {
  let layer:L.TileLayer|null=null,currentUrl:string|null=null,moving=false;
  let events:Parameters<TrafficMapPort['listen']>[0]|null=null;
  const clear=()=>{if(layer){layer.off();try{layer.remove();}catch{/* Map already gone. */}layer=null;}currentUrl=null;};
  return {
    getZoom:()=>map.getZoom(),isMoving:()=>moving,
    setTiles(url,attribution='© TomTom'){
      if(!url){clear();return;}
      if(currentUrl===url&&layer)return;
      if(layer){currentUrl=url;layer.setUrl(url);return;}
      const pane=map.getPane('role-traffic')||map.createPane('role-traffic');
      pane.style.zIndex='350';pane.style.pointerEvents='none';
      currentUrl=url;
      layer=L.tileLayer(url,{pane:'role-traffic',attribution,opacity:0.9,
        minZoom:TRAFFIC_MIN_ZOOM,maxNativeZoom:22,maxZoom:22,tileSize:256,
        crossOrigin:'anonymous',updateWhenIdle:true,updateWhenZooming:false,keepBuffer:1});
      layer.on('tileload',()=>events?.loaded());layer.on('tileerror',()=>events?.error());layer.addTo(map);
    },
    listen(listeners){
      events=listeners;
      const start=()=>{moving=true;},end=()=>{moving=false;listeners.idle();};
      map.on('movestart zoomstart',start);map.on('moveend zoomend',end);
      return()=>{events=null;map.off('movestart zoomstart',start);map.off('moveend zoomend',end);clear();};
    }
  };
}

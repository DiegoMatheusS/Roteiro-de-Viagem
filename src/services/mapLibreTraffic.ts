import type {Map as GlMap,MapSourceDataEvent,ErrorEvent} from 'maplibre-gl';
import {TRAFFIC_SOURCE_ID,TRAFFIC_MIN_ZOOM,isTrafficMapError,trafficViewportRadiusKm,type TrafficMapPort} from './trafficFlow';

let nextTrafficSource=0;
export function createMapLibreTrafficPort(map:GlMap):TrafficMapPort {
  const layerId='role-traffic-colors';let currentUrl:string|null=null;
  let sourceId:string|null=null;
  const clear=()=>{
    const previous=sourceId;sourceId=null;currentUrl=null;
    if(map.getLayer(layerId))map.removeLayer(layerId);
    if(previous&&map.getSource(previous))map.removeSource(previous);
  };
  return {
    getZoom:()=>map.getZoom(),
    getViewportRadiusKm:(from)=>{
      const center=map.getCenter(),bounds=map.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
      return trafficViewportRadiusKm(from??[center.lat,center.lng],[sw.lat,sw.lng],[ne.lat,ne.lng]);
    },
    isMoving:()=>map.isMoving(),
    setTiles(url,attribution='© TomTom'){
      try{
        if(!url){clear();return;}
        if(currentUrl===url&&sourceId&&map.getSource(sourceId))return;
        if(!map.getStyle())return;
        // setTiles() keeps the old tile cache while replacing its URLs. An old
        // red tile can finish after switching to full traffic and falsely mark
        // the new images as live. Each URL gets its own source identity.
        clear();currentUrl=url;sourceId=`${TRAFFIC_SOURCE_ID}-${++nextTrafficSource}`;
        map.addSource(sourceId,{type:'raster',tiles:[url],tileSize:256,
          minzoom:TRAFFIC_MIN_ZOOM,maxzoom:22,attribution});
        // Road names and every Rolê route stay above the transparent colors.
        const before=map.getStyle().layers.find(layer=>layer.type==='symbol'||layer.id.startsWith('role-'))?.id;
        map.addLayer({id:layerId,type:'raster',source:sourceId,
          paint:{'raster-opacity':0.9,'raster-fade-duration':0}},before);
      }catch{/* The parent may already have removed/replaced its map style. */}
    },
    listen(events){
      const loaded=(event:MapSourceDataEvent)=>{
        // Only a real tile from the current source confirms the new images.
        // Metadata and late callbacks from replaced sources cannot do that.
        if(currentUrl&&sourceId&&event.sourceId===sourceId&&event.tile?.state==='loaded')events.loaded();
      };
      const error=(event:ErrorEvent&{sourceId?:string})=>{
        if(!currentUrl||(event.sourceId&&event.sourceId!==sourceId))return;
        if(isTrafficMapError(event))events.error();
      };
      map.on('moveend',events.idle);map.on('style.load',events.style);
      map.on('sourcedata',loaded);map.on('error',error);
      return()=>{map.off('moveend',events.idle);map.off('style.load',events.style);
        map.off('sourcedata',loaded);map.off('error',error);};
    }
  };
}

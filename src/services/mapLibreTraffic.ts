import type {Map as GlMap,RasterTileSource,MapSourceDataEvent,ErrorEvent} from 'maplibre-gl';
import {TRAFFIC_SOURCE_ID,TRAFFIC_MIN_ZOOM,isTrafficMapError,trafficViewportRadiusKm,type TrafficMapPort} from './trafficFlow';

export function createMapLibreTrafficPort(map:GlMap):TrafficMapPort {
  const layerId='role-traffic-colors';let currentUrl:string|null=null;
  return {
    getZoom:()=>map.getZoom(),
    getViewportRadiusKm:()=>{
      const center=map.getCenter(),bounds=map.getBounds(),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
      return trafficViewportRadiusKm([center.lat,center.lng],[sw.lat,sw.lng],[ne.lat,ne.lng]);
    },
    isMoving:()=>map.isMoving(),
    setTiles(url,attribution='© TomTom'){
      try{
        if(!url){
          currentUrl=null;
          if(map.getLayer(layerId))map.removeLayer(layerId);
          if(map.getSource(TRAFFIC_SOURCE_ID))map.removeSource(TRAFFIC_SOURCE_ID);
          return;
        }
        const source=map.getSource(TRAFFIC_SOURCE_ID) as RasterTileSource|undefined;
        if(source){if(currentUrl!==url)source.setTiles([url]);currentUrl=url;return;}
        if(!map.getStyle())return;
        currentUrl=url;
        map.addSource(TRAFFIC_SOURCE_ID,{type:'raster',tiles:[url],tileSize:256,
          minzoom:TRAFFIC_MIN_ZOOM,maxzoom:22,attribution});
        // Road names and every Rolê route stay above the transparent colors.
        const before=map.getStyle().layers.find(layer=>layer.type==='symbol'||layer.id.startsWith('role-'))?.id;
        map.addLayer({id:layerId,type:'raster',source:TRAFFIC_SOURCE_ID,
          paint:{'raster-opacity':0.9,'raster-fade-duration':0}},before);
      }catch{/* The parent may already have removed/replaced its map style. */}
    },
    listen(events){
      const loaded=(event:MapSourceDataEvent)=>{
        if(currentUrl&&event.sourceId===TRAFFIC_SOURCE_ID&&event.sourceDataType==='content')events.loaded();
      };
      const error=(event:ErrorEvent)=>{if(isTrafficMapError(event))events.error();};
      map.on('moveend',events.idle);map.on('style.load',events.style);
      map.on('sourcedata',loaded);map.on('error',error);
      return()=>{map.off('moveend',events.idle);map.off('style.load',events.style);
        map.off('sourcedata',loaded);map.off('error',error);};
    }
  };
}

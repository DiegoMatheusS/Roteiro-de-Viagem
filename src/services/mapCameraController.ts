/** Single-owner camera API. The hybrid renderer MUST use Leaflet; the MapLibre
 * adapter is reserved for a future standalone renderer after gestures migrate.
 * Never command both cameras: their transform trees will diverge. */
export type CameraPoint = [number,number]; // [latitude, longitude]
export type CameraMode = 'following'|'exploring';

export function nextCameraMode(current:CameraMode,event:'drag'|'recenter'|'stop'):CameraMode {
  if(event==='drag')return 'exploring';
  if(event==='recenter'||event==='stop')return 'following';
  return current;
}

export function recenterZoom(currentZoom:number,navigation:boolean):number {
  // Preserve an intentional manual zoom on an active trip. First fix from the
  // continental view must still zoom in to make navigation usable.
  return navigation && Number.isFinite(currentZoom) && currentZoom>=10
    ? Math.min(currentZoom,19) : 15;
}
export interface CameraPort {
  zoom():number;
  recenter(point:CameraPoint,navigation:boolean,reducedMotion:boolean):void;
  follow(point:CameraPoint,reducedMotion:boolean):void;
}
interface LeafletCamera {
  getZoom():number;
  setView(point:CameraPoint,zoom:number,options:{animate:boolean}):unknown;
  flyTo(point:CameraPoint,zoom:number,options:{duration:number;easeLinearity:number}):unknown;
  panTo(point:CameraPoint,options:{animate:boolean;duration?:number;easeLinearity?:number}):unknown;
}
/** Current production camera owner: both Leaflet overlays and MapLibre bridge use its viewport. */
export function createHybridCameraPort(map:LeafletCamera):CameraPort {
  return {
    zoom:()=>map.getZoom(),
    recenter(point,navigation,reducedMotion){
      const zoom=recenterZoom(map.getZoom(),navigation);
      if(reducedMotion)map.setView(point,zoom,{animate:false});
      else map.flyTo(point,zoom,{duration:0.55,easeLinearity:0.3});
    },
    follow(point,reducedMotion){
      if(reducedMotion)map.panTo(point,{animate:false});
      else map.panTo(point,{animate:true,duration:0.45,easeLinearity:0.3});
    }
  };
}
interface StandaloneMapLibreCamera {
  getZoom():number;
  jumpTo(options:{center:[number,number];zoom?:number}):unknown;
  easeTo(options:{center:[number,number];zoom?:number;duration:number}):unknown;
}
/** Future standalone-only adapter. Not used while MapLibre is inside Leaflet. */
export function createStandaloneMapLibreCameraPort(map:StandaloneMapLibreCamera):CameraPort {
  const lngLat=([lat,lon]:CameraPoint):[number,number]=>[lon,lat];
  return {
    zoom:()=>map.getZoom(),
    recenter(point,navigation,reducedMotion){
      const zoom=recenterZoom(map.getZoom(),navigation);
      if(reducedMotion)map.jumpTo({center:lngLat(point),zoom});
      else map.easeTo({center:lngLat(point),zoom,duration:550});
    },
    follow(point,reducedMotion){
      if(reducedMotion)map.jumpTo({center:lngLat(point)});
      else map.easeTo({center:lngLat(point),duration:450});
    }
  };
}

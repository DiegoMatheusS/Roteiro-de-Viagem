/** Single-owner camera API. Hybrid maps use Leaflet; active standalone
 * navigation uses MapLibre. Never command both cameras for one viewport. */
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
export interface CameraFitPadding {
  topLeft:[number,number];
  bottomRight:[number,number];
  maxZoom:number;
}
export interface CameraPort {
  zoom():number;
  stop():void;
  firstGpsFix(point:CameraPoint):void;
  focus(point:CameraPoint,zoom:number,reducedMotion?:boolean):void;
  fitRoute(points:readonly CameraPoint[],padding:CameraFitPadding):void;
  recenter(point:CameraPoint,navigation:boolean,reducedMotion:boolean):void;
  follow(point:CameraPoint,reducedMotion:boolean):void;
}
interface LeafletCamera {
  getZoom():number;
  stop():unknown;
  setView(point:CameraPoint,zoom:number,options:{animate:boolean}):unknown;
  flyTo(point:CameraPoint,zoom:number,options:{duration:number;easeLinearity:number}):unknown;
  panTo(point:CameraPoint,options:{animate:boolean;duration?:number;easeLinearity?:number}):unknown;
  fitBounds(points:CameraPoint[],options:{
    paddingTopLeft:[number,number];paddingBottomRight:[number,number];maxZoom:number;animate:boolean
  }):unknown;
}
/** Current production camera owner: both Leaflet overlays and MapLibre bridge use its viewport. */
export function createHybridCameraPort(map:LeafletCamera):CameraPort {
  return {
    zoom:()=>map.getZoom(),
    stop:()=>{map.stop();},
    firstGpsFix(point){
      // The first live location must not animate from a distant map center.
      map.setView(point,16,{animate:false});
    },
    focus(point,zoom,reducedMotion=true){
      if(reducedMotion)map.setView(point,zoom,{animate:false});
      else map.flyTo(point,zoom,{duration:1.2,easeLinearity:0.25});
    },
    fitRoute(points,padding){
      if(!points.length)return;
      map.fitBounds([...points],{
        paddingTopLeft:padding.topLeft,paddingBottomRight:padding.bottomRight,
        maxZoom:padding.maxZoom,animate:false
      });
    },
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
  stop(allowGestures?:boolean):unknown;
  jumpTo(options:{center:[number,number];zoom?:number;bearing?:number}):unknown;
  easeTo(options:{center:[number,number];zoom?:number;bearing?:number;duration:number}):unknown;
  fitBounds(bounds:[[number,number],[number,number]],options:{
    padding:{top:number;right:number;bottom:number;left:number};maxZoom:number;duration:number;bearing?:number
  }):unknown;
}
/** Standalone-only adapter. Never used while MapLibre is inside Leaflet. */
export function createStandaloneMapLibreCameraPort(
  map:StandaloneMapLibreCamera,getBearing?:()=>number
):CameraPort {
  const lngLat=([lat,lon]:CameraPoint):[number,number]=>[lon,lat];
  const orientation=()=>{
    const bearing=getBearing?.();
    return bearing!==undefined && Number.isFinite(bearing)?{bearing}:{};
  };
  return {
    zoom:()=>map.getZoom(),
    // Preserve the native gesture that just took ownership of the camera.
    stop:()=>{map.stop(true);},
    firstGpsFix(point){
      map.jumpTo({center:lngLat(point),zoom:16,...orientation()});
    },
    focus(point,zoom,reducedMotion=true){
      if(reducedMotion)map.jumpTo({center:lngLat(point),zoom,...orientation()});
      else map.easeTo({center:lngLat(point),zoom,duration:1200,...orientation()});
    },
    fitRoute(points,padding){
      const valid=points.filter(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180);
      if(!valid.length)return;
      // Long OSRM geometries can exceed the JavaScript argument limit when
      // spread into Math.min/Math.max. Scan without allocating parallel arrays.
      let minLat=Infinity,minLon=Infinity,maxLat=-Infinity,maxLon=-Infinity;
      for(const [lat,lon] of valid){
        minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
        minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);
      }
      map.fitBounds(
        [[minLon,minLat],[maxLon,maxLat]],
        {padding:{top:padding.topLeft[1],left:padding.topLeft[0],
          bottom:padding.bottomRight[1],right:padding.bottomRight[0]},
          maxZoom:padding.maxZoom,duration:0,...orientation()}
      );
    },
    recenter(point,navigation,reducedMotion){
      const zoom=recenterZoom(map.getZoom(),navigation);
      if(reducedMotion)map.jumpTo({center:lngLat(point),zoom,...orientation()});
      else map.easeTo({center:lngLat(point),zoom,duration:550,...orientation()});
    },
    follow(point,reducedMotion){
      if(reducedMotion)map.jumpTo({center:lngLat(point),...orientation()});
      else map.easeTo({center:lngLat(point),duration:450,...orientation()});
    }
  };
}

/** Single-owner camera API. Hybrid maps use Leaflet; active standalone
 * navigation uses MapLibre. Never command both cameras for one viewport. */
export type CameraPoint = [number,number]; // [latitude, longitude]
export type CameraMode = 'following'|'exploring';
export const NAVIGATION_START_ZOOM=18.5;
export const NAVIGATION_START_PITCH=55;

export function nextCameraMode(current:CameraMode,event:'drag'|'recenter'|'stop'):CameraMode {
  if(event==='drag')return 'exploring';
  if(event==='recenter'||event==='stop')return 'following';
  return current;
}

export function recenterZoom(currentZoom:number,navigation:boolean,restoreNavigationView=false):number {
  // Preserve an intentional manual zoom on an active trip. First fix from the
  // continental view must still zoom in to make navigation usable.
  if(navigation&&restoreNavigationView)return NAVIGATION_START_ZOOM;
  return navigation && Number.isFinite(currentZoom) && currentZoom>=10
    ? Math.min(currentZoom,19) : navigation?NAVIGATION_START_ZOOM:15;
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
  recenter(point:CameraPoint,navigation:boolean,reducedMotion:boolean,restoreNavigationView?:boolean):void;
  follow(point:CameraPoint,reducedMotion:boolean):void;
  /** Optional: native turn zoom, never invoked by the raster/Leaflet fallback. */
  zoomToTurn?(point:CameraPoint,zoom:number,reducedMotion:boolean):void;
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
      map.setView(point,NAVIGATION_START_ZOOM,{animate:false});
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
    recenter(point,navigation,reducedMotion,restoreNavigationView=false){
      const zoom=recenterZoom(map.getZoom(),navigation,restoreNavigationView);
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
  getPitch?():number;
  getContainer?():{clientHeight:number};
  stop():unknown;
  jumpTo(options:{center:[number,number];zoom?:number;bearing?:number;pitch?:number;padding?:CameraInsets}):unknown;
  easeTo(options:{center:[number,number];zoom?:number;bearing?:number;pitch?:number;padding?:CameraInsets;duration:number}):unknown;
  fitBounds(bounds:[[number,number],[number,number]],options:{
    padding:{top:number;right:number;bottom:number;left:number};maxZoom:number;duration:number;bearing?:number
  }):unknown;
}
interface CameraInsets {top:number;right:number;bottom:number;left:number}
/** Standalone-only adapter. Never used while MapLibre is inside Leaflet. */
export function createStandaloneMapLibreCameraPort(
  map:StandaloneMapLibreCamera,getBearing?:()=>number
):CameraPort {
  const lngLat=([lat,lon]:CameraPoint):[number,number]=>[lon,lat];
  const orientation=()=>{
    const bearing=getBearing?.();
    return bearing!==undefined && Number.isFinite(bearing)?{bearing}:{};
  };
  // Put the vehicle below the visual center, leaving more road ahead visible.
  // Padding works for both jumpTo (reduced motion) and easeTo, and survives
  // follow updates without queueing a second camera animation.
  const navigationView=()=>({pitch:NAVIGATION_START_PITCH,
    padding:{top:Math.round((map.getContainer?.().clientHeight??0)*0.24),right:0,bottom:0,left:0}});
  let pendingView:ReturnType<typeof navigationView>|null=null;
  const continuingView=()=>{
    // A GPS fix can arrive during the recenter animation. Carry its target
    // pitch into the replacement move instead of freezing halfway to 55°.
    const pitch=map.getPitch?.();
    if(pendingView&&pitch!==undefined&&Math.abs(pitch-NAVIGATION_START_PITCH)<0.01)pendingView=null;
    return pendingView??{};
  };
  return {
    zoom:()=>map.getZoom(),
    // The session invokes this once before a manual gesture starts. MapLibre
    // 6 does not forward an allowGestures argument on the public Map.stop().
    stop:()=>{pendingView=null;map.stop();},
    firstGpsFix(point){
      pendingView=null;
      map.jumpTo({center:lngLat(point),zoom:NAVIGATION_START_ZOOM,...orientation(),...navigationView()});
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
    recenter(point,navigation,reducedMotion,restoreNavigationView=false){
      const zoom=recenterZoom(map.getZoom(),navigation,restoreNavigationView);
      pendingView=navigation&&restoreNavigationView?navigationView():null;
      const view=pendingView??{};
      if(reducedMotion){map.jumpTo({center:lngLat(point),zoom,...orientation(),...view});pendingView=null;}
      else map.easeTo({center:lngLat(point),zoom,duration:550,...orientation(),...view});
    },
    follow(point,reducedMotion){
      const view=continuingView();
      if(reducedMotion){map.jumpTo({center:lngLat(point),...orientation(),...view});pendingView=null;}
      else map.easeTo({center:lngLat(point),duration:450,...orientation(),...view});
    },
    zoomToTurn(point,zoom,reducedMotion){
      // One owner, one camera move: keep the vehicle centered through zoom.
      const view=continuingView();
      if(reducedMotion){map.jumpTo({center:lngLat(point),zoom,...orientation(),...view});pendingView=null;}
      else map.easeTo({center:lngLat(point),zoom,duration:440,...orientation(),...view});
    }
  };
}

interface MapLibreOrientationCamera {
  getBearing():number;
  jumpTo(options:{bearing:number}):unknown;
  easeTo(options:{bearing:number;duration:number}):unknown;
}
/** An explicit compass action can orient an explored map without resuming GPS
 * or changing its center/zoom. GPS-driven bearing still uses the follow command. */
export function orientMapLibreCamera(map:MapLibreOrientationCamera,bearing:number,reducedMotion:boolean):void {
  if(!Number.isFinite(bearing))return;
  const delta=((bearing-map.getBearing()+180)%360+360)%360-180;
  if(Math.abs(delta)<0.001)return;
  if(reducedMotion)map.jumpTo({bearing});
  else map.easeTo({bearing,duration:260});
}

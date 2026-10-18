import type {CameraMode,CameraPoint} from './mapCameraController';

export interface MapFallbackState {
  mode:CameraMode;
  centerRequest:number;
  position:CameraPoint|null;
  fittedRoute:string|null;
  focusedCoords?:CameraPoint|null;
}
export interface MapFallbackViewport extends MapFallbackState {
  center:CameraPoint;
  zoom:number;
}
interface ViewportReader {
  getCenter():{lat:number;lng:number};
  getZoom():number;
}

/** Read the last viewport without depending on a healthy WebGL context. An
 * unavailable/invalid camera leaves the existing cold-start fallback intact. */
export function captureMapFallbackViewport(
  map:ViewportReader,state:MapFallbackState,maxZoom:number
):MapFallbackViewport|undefined {
  try {
    const {lat,lng}=map.getCenter(),zoom=map.getZoom();
    if(![lat,lng,zoom,maxZoom].every(Number.isFinite) || Math.abs(lat)>90 || maxZoom<1)return;
    return {...state,center:[lat,lng],zoom:Math.max(1,Math.min(maxZoom,zoom)),
      position:state.position?[...state.position]:null,
      focusedCoords:state.focusedCoords?[...state.focusedCoords]:state.focusedCoords};
  }catch{return;}
}

export function sameMapFocus(a?:CameraPoint|null,b?:CameraPoint|null):boolean {
  return a===b || !!(a && b && a[0]===b[0] && a[1]===b[1]);
}

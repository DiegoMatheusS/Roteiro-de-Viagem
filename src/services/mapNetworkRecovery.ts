/** Transient network errors must not tear down the active navigation canvas.
 * Only a loaded, online map can escalate repeated drawing/tile errors to the
 * raster fallback. A disconnected map keeps existing camera and overlays. */
export interface MapLoadFailureDecision {
  consecutiveErrors:number;
  retryOnReconnect:boolean;
  fallback:boolean;
}
export function assessMapLoadFailure(input:{
  loaded:boolean;
  changingStyle:boolean;
  online:boolean;
  consecutiveErrors:number;
}):MapLoadFailureDecision {
  if(!input.online)return {consecutiveErrors:0,retryOnReconnect:true,fallback:false};
  if(!input.loaded||input.changingStyle)return {
    consecutiveErrors:0,retryOnReconnect:false,fallback:false
  };
  const errors=Math.max(0,Math.floor(input.consecutiveErrors))+1;
  return {consecutiveErrors:errors,retryOnReconnect:false,fallback:errors>=3};
}
/** Rebuild remote map tiles only after an offline failure or incomplete style.
 * A clean reconnection does not reset camera/route/marker layers unnecessarily. */
export function shouldReloadAfterReconnect(
  hadOffline:boolean,failedOfflineTiles:boolean,styleLoaded:boolean
):boolean {
  return hadOffline&&(failedOfflineTiles||!styleLoaded);
}

import type {DeviceLocation} from './locationService';

export interface NativeTrackingState {
  tripId?:string;
  distanceKm:number;
  position:DeviceLocation|null;
  error:string|null;
  running:boolean;
}

/** The Android bridge deserializes a fresh object on every 2 s poll, even when
 * the service has not produced a new fix. Compare by value so an unchanged fix
 * keeps its identity (and its `coords` array) instead of looking like new GPS
 * data to React and to the map. */
export function sameLocation(a:DeviceLocation|null|undefined,b:DeviceLocation|null|undefined):boolean{
  if(a===b)return true;
  if(!a||!b)return false;
  return a.timestamp===b.timestamp&&a.accuracyMeters===b.accuracyMeters&&
    a.speedMetersPerSecond===b.speedMetersPerSecond&&(a.headingDegrees??null)===(b.headingDegrees??null)&&
    a.coords[0]===b.coords[0]&&a.coords[1]===b.coords[1];
}

/** Returns `previous` itself when nothing changed (React then skips the render),
 * otherwise `next`, still reusing the previous position object when only other
 * fields (distance, running, error) moved. */
export function mergeNativeTrackingState(previous:NativeTrackingState,next:NativeTrackingState):NativeTrackingState{
  const position=sameLocation(previous.position,next.position)?previous.position:next.position;
  if(previous.tripId===next.tripId&&previous.distanceKm===next.distanceKm&&
     previous.running===next.running&&previous.error===next.error&&previous.position===position)return previous;
  return position===next.position?next:{...next,position};
}

import {useEffect,useState} from 'react';
import {distanceBetweenKm} from '../services/gpsTracking';

type Coords=[number,number];

/** A live GPS fix moves by a few metres even while the phone is still.
 * Tourist discovery must keep one query/ordering anchor until the user
 * actually travels, and keep the last list through temporary GPS loss.
 * Routing and the blue location arrow continue using the live GPS fix. */
export function nextTouristDiscoveryAnchor(
  previous:Coords|undefined,fix:Coords|undefined,moveThresholdMeters=250
):Coords|undefined {
  if(!fix||!Number.isFinite(fix[0])||!Number.isFinite(fix[1])||
     Math.abs(fix[0])>90||Math.abs(fix[1])>180)return previous;
  if(previous&&distanceBetweenKm(previous,fix)*1000<moveThresholdMeters)return previous;
  return [fix[0],fix[1]];
}

export function useTouristDiscoveryAnchor(fix:Coords|undefined,moveThresholdMeters=250){
  const [anchor,setAnchor]=useState<Coords|undefined>(()=>nextTouristDiscoveryAnchor(undefined,fix));
  useEffect(()=>{
    setAnchor(previous=>nextTouristDiscoveryAnchor(previous,fix,moveThresholdMeters));
  },[fix?.[0],fix?.[1],moveThresholdMeters]);
  return anchor;
}

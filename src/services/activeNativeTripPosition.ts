import type {DeviceLocation} from './locationService';
import {isFreshGpsFix} from './gpsFreshness';

/** No GPS position from another trip, a stopped native service or an expired
 * sample can drive navigation or speedometer even if the last fix looked good. */
export function activeNativeTripPosition(
  state:{tripId?:string;running:boolean;position?:DeviceLocation|null},
  expectedTripId?:string,now=Date.now()
):DeviceLocation|null{
  if(!expectedTripId||state.tripId!==expectedTripId||!state.running||
     !state.position||!isFreshGpsFix(state.position.timestamp,now))return null;
  return state.position;
}

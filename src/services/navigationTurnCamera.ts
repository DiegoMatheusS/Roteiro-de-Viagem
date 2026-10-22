/** Camera assistance is visual only. The turn and distance must originate
 * from verified road-routing maneuvers, never from estimated straight lines.
 * Hysteresis prevents zoom oscillation from noisy GPS near a threshold. */
export function nextTurnCameraZoom(
  distanceMeters:number|null|undefined,
  speedMetersPerSecond:number|null|undefined,
  nearTurn:boolean
):number|null{
  const speed=Number.isFinite(speedMetersPerSecond)
    ?Math.max(0,Math.min(40,speedMetersPerSecond!)):0;
  const trigger=Math.max(240,Math.min(450,240+speed*5));
  if(!Number.isFinite(distanceMeters)||distanceMeters==null||distanceMeters<0)
    return nearTurn?16:null;
  if(nearTurn)return distanceMeters>trigger+150?16:null;
  if(distanceMeters<=trigger)return speed>=18?16.5:17;
  return null;
}

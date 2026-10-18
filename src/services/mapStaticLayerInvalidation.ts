/** Minimal signature-based invalidation for separate Leaflet fallback layers.
 * Selecting a different OSRM route should redraw its lines, not remove every
 * tourist stop, meeting point, weather popup and origin/destination pin.
 * React props are treated as immutable: nested values should be replaced on update.
 */
export interface StaticLayerInputs {
  navigation:readonly unknown[];
  stops:readonly unknown[];
  meetings:readonly unknown[];
  weather:readonly unknown[];
}
export interface StaticLayerChanges {
  navigation:boolean;
  stops:boolean;
  meetings:boolean;
  weather:boolean;
}
function changed(previous:readonly unknown[]|undefined,next:readonly unknown[]):boolean {
  if(!previous || previous.length!==next.length)return true;
  return next.some((value,index)=>!Object.is(value,previous[index]));
}
export function changedStaticLayers(previous:StaticLayerInputs|null,next:StaticLayerInputs):StaticLayerChanges {
  return {
    navigation:changed(previous?.navigation,next.navigation),
    stops:changed(previous?.stops,next.stops),
    meetings:changed(previous?.meetings,next.meetings),
    weather:changed(previous?.weather,next.weather)
  };
}

export type MapIconDensity='less'|'moderate'|'more';
export const MAP_ICON_DENSITY_KEY='role:map-icon-density:v1';
export const MAP_ICON_DENSITY_EVENT='role-map-icon-density-change';
export function parseMapIconDensity(value:unknown):MapIconDensity {
  return value==='less'||value==='more'?value:'moderate';
}
export function readMapIconDensity():MapIconDensity {
  try{return parseMapIconDensity(window.localStorage.getItem(MAP_ICON_DENSITY_KEY));}
  catch{return 'moderate';}
}
export function writeMapIconDensity(value:MapIconDensity){
  const mode=parseMapIconDensity(value);
  try{window.localStorage.setItem(MAP_ICON_DENSITY_KEY,mode);}catch{/* Storage may be unavailable. */}
  window.dispatchEvent(new Event(MAP_ICON_DENSITY_EVENT));
}

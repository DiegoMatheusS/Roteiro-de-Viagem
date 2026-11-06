import {useSyncExternalStore} from 'react';
import {MAP_ICON_DENSITY_EVENT,MAP_ICON_DENSITY_KEY,readMapIconDensity,writeMapIconDensity} from '../services/mapIconDensity';
const subscribe=(changed:()=>void)=>{
  const storage=(event:StorageEvent)=>{if(event.key===MAP_ICON_DENSITY_KEY||event.key===null)changed();};
  window.addEventListener(MAP_ICON_DENSITY_EVENT,changed);
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(MAP_ICON_DENSITY_EVENT,changed);window.removeEventListener('storage',storage);};
};
export function useMapIconDensity(){
  return {mode:useSyncExternalStore(subscribe,readMapIconDensity,()=> 'moderate' as const),setMode:writeMapIconDensity};
}

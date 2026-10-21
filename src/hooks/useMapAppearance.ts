import { useEffect, useState } from 'react';
import { MAP_APPEARANCE_EVENT, MAP_APPEARANCE_KEY, readMapAppearance,
  resolveMapTheme, writeMapAppearance, type MapAppearanceMode } from '../services/mapAppearance';

export function useMapAppearance() {
  const [mode,setMode] = useState(readMapAppearance);
  const [tick,setTick] = useState(0);
  useEffect(()=>{
    const sync=()=>{setMode(readMapAppearance());setTick(t=>t+1);};
    const storage=(event:StorageEvent)=>{if(event.key===MAP_APPEARANCE_KEY)sync();};
    const media=window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change',sync);
    window.addEventListener(MAP_APPEARANCE_EVENT,sync);
    window.addEventListener('storage',storage);
    const interval=window.setInterval(()=>setTick(t=>t+1),60_000);
    return ()=>{
      media?.removeEventListener?.('change',sync);
      window.removeEventListener(MAP_APPEARANCE_EVENT,sync);
      window.removeEventListener('storage',storage);
      window.clearInterval(interval);
    };
  },[]);
  void tick;
  const theme=resolveMapTheme(mode,new Date(),window.matchMedia?.('(prefers-color-scheme: dark)')?.matches??false);
  return { mode, theme, setMode:(next:MapAppearanceMode)=>writeMapAppearance(next) };
}

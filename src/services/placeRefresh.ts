interface PlaceDocument extends EventTarget {hidden:boolean}
interface PlaceWindow extends EventTarget {navigator:{onLine:boolean}}

export const MAP_PLACES_REFRESH_MS=30_000;

/** Only the visible, online app polls its own catalog. Focus/resume events
 * arrive in bursts on Android; coalesce them and release every timer on exit. */
export function bindPlaceRefresh(doc:PlaceDocument,win:PlaceWindow,refresh:()=>void,
  pause:()=>void,intervalMs=MAP_PLACES_REFRESH_MS):()=>void {
  let disposed=false,timer:ReturnType<typeof setTimeout>|null=null;
  const active=()=>!disposed&&!doc.hidden&&win.navigator.onLine!==false;
  const clear=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
  const schedule=(delay:number)=>{
    clear();
    if(!active())return;
    timer=setTimeout(()=>{timer=null;if(!active())return;refresh();schedule(intervalMs);},delay);
  };
  const resume=()=>{if(active())schedule(200);};
  const hidden=()=>{if(doc.hidden){clear();pause();}else resume();};
  const offline=()=>{clear();pause();};
  doc.addEventListener('visibilitychange',hidden);
  win.addEventListener('focus',resume);
  win.addEventListener('pageshow',resume);
  win.addEventListener('online',resume);
  win.addEventListener('offline',offline);
  schedule(intervalMs);
  return ()=>{
    disposed=true;clear();
    doc.removeEventListener('visibilitychange',hidden);
    win.removeEventListener('focus',resume);
    win.removeEventListener('pageshow',resume);
    win.removeEventListener('online',resume);
    win.removeEventListener('offline',offline);
  };
}

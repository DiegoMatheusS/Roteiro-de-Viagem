/** Return to GPS after the last finished manual navigation gesture.
 * The timer belongs to the active map and is disposed on unmount: no new
 * backend polling and no movement while the user is holding the screen. */
export const NAVIGATION_IDLE_FOLLOW_MS = 7000;

export interface IdleFollowClock {
  set(callback:()=>void,delayMs:number):unknown;
  clear(handle:unknown):void;
}

const defaultClock:IdleFollowClock={
  set:(callback,delay)=>setTimeout(callback,delay),
  clear:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export function createNavigationIdleFollow(options:{
  active:()=>boolean;
  resume:()=>boolean;
  delayMs?:number;
  clock?:IdleFollowClock;
}){
  const clock=options.clock||defaultClock;
  const delay=Math.max(0,options.delayMs??NAVIGATION_IDLE_FOLLOW_MS);
  let handle:unknown=null;
  let exploring=false;
  let held=false;
  let disposed=false;
  const clear=()=>{
    if(handle!==null){clock.clear(handle);handle=null;}
  };
  const reset=()=>{
    clear();held=false;exploring=false;
  };
  const schedule=()=>{
    clear();
    if(disposed||!options.active()||!exploring||held)return;
    handle=clock.set(()=>{
      handle=null;
      if(disposed||!options.active()){reset();return;}
      if(held)return;
      if(options.resume())reset();
      else schedule(); // Wait for a valid GPS fix; never jump to old coordinates.
    },delay);
  };
  return {
    /** Any active pointer holds off recentering, even before the first pan. */
    hold(){if(!disposed&&options.active()){held=true;clear();}},
    /** Genuine pan/pinch/wheel/rotate interaction resets the idle period. */
    activity(){
      if(disposed||!options.active())return;
      exploring=true;schedule();
    },
    /** On the last finger/mouse release, start the full seven seconds. */
    release(){if(disposed)return;held=false;schedule();},
    reset,
    dispose(){disposed=true;reset();}
  };
}

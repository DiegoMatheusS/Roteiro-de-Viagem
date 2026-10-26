export interface MapUpdateClock {
  set(callback:()=>void,delayMs:number):unknown;
  clear(handle:unknown):void;
}
const defaultClock:MapUpdateClock={
  set:(callback,delay)=>setTimeout(callback,delay),
  clear:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** The map owner holds this gate until every pointer and native inertial
 * movement ends. Repeated GPS/data updates collapse into one fresh render
 * after a short quiet period; there is no polling or tile-network dependency. */
export function createMapGestureUpdates(flush:()=>void,options:{
  delayMs?:number;clock?:MapUpdateClock
}={}){
  const clock=options.clock||defaultClock;
  let held=false,pending=false,disposed=false;
  let handle:unknown=null;
  const clear=()=>{
    if(handle!==null){clock.clear(handle);handle=null;}
  };
  return {
    paused:()=>held||handle!==null,
    request(){
      if(disposed)return;
      if(held||handle!==null){pending=true;return;}
      flush();
    },
    hold(){
      if(disposed)return;
      clear();held=true;pending=true;
    },
    release(){
      if(disposed)return;
      held=false;clear();
      if(!pending)return;
      handle=clock.set(()=>{
        handle=null;
        if(disposed||held||!pending)return;
        pending=false;flush();
      },options.delayMs??160);
    },
    dispose(){disposed=true;held=false;pending=false;clear();}
  };
}

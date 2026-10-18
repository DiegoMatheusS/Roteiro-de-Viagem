interface ResumeDocument extends EventTarget { hidden:boolean; }
interface ResumeWindow extends EventTarget {
  requestAnimationFrame(callback:FrameRequestCallback):number;
  cancelAnimationFrame(id:number):void;
}

/** Refresh the existing viewport after returning to the app, without requesting
 * a GPS recenter or fitting the route again. Coalesce lifecycle events because
 * visibilitychange, focus and pageshow may fire together on mobile browsers. */
export function bindMapResumeRefresh(
  doc:ResumeDocument,win:ResumeWindow,refresh:()=>void
):()=>void {
  let disposed=false;
  let frame:number|null=null;
  const resume=()=>{
    if(disposed || doc.hidden || frame!==null)return;
    frame=win.requestAnimationFrame(()=>{
      frame=null;
      if(!disposed && !doc.hidden)refresh();
    });
  };
  const visibility=()=>{
    if(doc.hidden){
      if(frame!==null)win.cancelAnimationFrame(frame);
      frame=null;
    }else resume();
  };
  doc.addEventListener('visibilitychange',visibility);
  win.addEventListener('pageshow',resume);
  win.addEventListener('focus',resume);
  win.addEventListener('orientationchange',resume);
  return ()=>{
    disposed=true;
    doc.removeEventListener('visibilitychange',visibility);
    win.removeEventListener('pageshow',resume);
    win.removeEventListener('focus',resume);
    win.removeEventListener('orientationchange',resume);
    if(frame!==null)win.cancelAnimationFrame(frame);
    frame=null;
  };
}

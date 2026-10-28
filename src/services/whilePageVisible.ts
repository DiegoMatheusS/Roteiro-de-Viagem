type Events=Pick<EventTarget,'addEventListener'|'removeEventListener'>;
type VisibilityDocument=Events&Pick<Document,'hidden'>;

/** Release foreground-only resources while hidden, including the page cache.
 * A consented native trip/convoy service has its own lifetime. */
export function whilePageVisible(start:()=>()=>void,
  doc:VisibilityDocument|undefined=globalThis.document,page:Events|undefined=globalThis.window):()=>void {
  let disposed=false,pageHidden=false,stop:(()=>void)|null=null;
  const update=()=>{
    if(disposed||pageHidden||doc?.hidden){stop?.();stop=null;return;}
    if(!stop)stop=start();
  };
  const hide=()=>{pageHidden=true;update();};
  const show=()=>{pageHidden=false;update();};
  doc?.addEventListener('visibilitychange',update);
  page?.addEventListener('pagehide',hide);
  page?.addEventListener('pageshow',show);
  update();
  return ()=>{
    if(disposed)return;
    disposed=true;update();
    doc?.removeEventListener('visibilitychange',update);
    page?.removeEventListener('pagehide',hide);
    page?.removeEventListener('pageshow',show);
  };
}

/** Detect explicit user map navigation intents without confusing them with GPS camera moves.
 * Zoom stays owned by Leaflet while the vector MapLibre layer uses its viewport.
 */
export type MapZoomGesture =
  | {type:'wheel';deltaY:number}
  | {type:'touchstart';touchCount:number}
  | {type:'pointerdown';activeTouchPointers:number}
  | {type:'dblclick'|'gesturestart'}
  | {type:'keydown';key:string};

export function isManualMapZoom(gesture:MapZoomGesture):boolean {
  switch(gesture.type){
    case 'wheel': return Number.isFinite(gesture.deltaY) && gesture.deltaY!==0;
    case 'touchstart': return gesture.touchCount>=2;
    case 'pointerdown': return gesture.activeTouchPointers>=2;
    case 'dblclick':
    case 'gesturestart': return true;
    case 'keydown': return ['+','=','-','_','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(gesture.key);
  }
}

function isMarkerOrPopup(event:Event):boolean {
  const target=event.target;
  if(typeof Element!=='undefined'&&target instanceof Element&&target.closest('.role-poi-marker,.managed-place-marker'))return false;
  return typeof Element!=='undefined' && target instanceof Element &&
    Boolean(target.closest('.leaflet-marker-icon,.maplibregl-marker,.leaflet-popup,.maplibregl-popup,.leaflet-control'));
}

/** Listeners are passive: never block scroll, pinch or map controls.
 * Notifies the camera controller to pause GPS following until recentered.
 */
export function bindManualMapZoom(target:HTMLElement,onManualZoom:()=>void):()=>void {
  const pointerIds=new Set<number>();
  const notify=(event:Event,gesture:MapZoomGesture)=>{
    if(!isMarkerOrPopup(event) && isManualMapZoom(gesture))onManualZoom();
  };
  const wheel=(event:WheelEvent)=>notify(event,{type:'wheel',deltaY:event.deltaY});
  const touch=(event:TouchEvent)=>notify(event,{type:'touchstart',touchCount:event.touches.length});
  const doubleClick=(event:MouseEvent)=>notify(event,{type:'dblclick'});
  const gesture=(event:Event)=>notify(event,{type:'gesturestart'});
  const key=(event:KeyboardEvent)=>{
    if(typeof HTMLElement!=='undefined' && event.target instanceof HTMLElement &&
      (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable))return;
    notify(event,{type:'keydown',key:event.key});
  };
  const pointerDown=(event:PointerEvent)=>{
    if(event.pointerType!=='touch' || isMarkerOrPopup(event))return;
    pointerIds.add(event.pointerId);
    notify(event,{type:'pointerdown',activeTouchPointers:pointerIds.size});
  };
  const pointerEnd=(event:Event)=>{pointerIds.delete((event as PointerEvent).pointerId);};
  const resetPointers=()=>pointerIds.clear();
  // A finger can leave the map before being released. Observe its end on the
  // owning document; don't capture pointers or interfere with native gestures.
  const pointerEndTarget=target.ownerDocument || target;
  const ownerWindow=target.ownerDocument?.defaultView;
  const handleVisibility=()=>{
    if(target.ownerDocument?.visibilityState==='hidden')resetPointers();
  };
  const passiveCapture={passive:true,capture:true} as const;
  target.addEventListener('wheel',wheel,passiveCapture);
  target.addEventListener('touchstart',touch,passiveCapture);
  target.addEventListener('dblclick',doubleClick,passiveCapture);
  target.addEventListener('gesturestart',gesture,passiveCapture);
  target.addEventListener('keydown',key,true);
  target.addEventListener('pointerdown',pointerDown,passiveCapture);
  pointerEndTarget.addEventListener('pointerup',pointerEnd,passiveCapture);
  pointerEndTarget.addEventListener('pointercancel',pointerEnd,passiveCapture);
  target.addEventListener('lostpointercapture',pointerEnd,passiveCapture);
  ownerWindow?.addEventListener('blur',resetPointers);
  target.ownerDocument?.addEventListener('visibilitychange',handleVisibility);
  return ()=>{
    target.removeEventListener('wheel',wheel,passiveCapture);
    target.removeEventListener('touchstart',touch,passiveCapture);
    target.removeEventListener('dblclick',doubleClick,passiveCapture);
    target.removeEventListener('gesturestart',gesture,passiveCapture);
    target.removeEventListener('keydown',key,{capture:true});
    target.removeEventListener('pointerdown',pointerDown,passiveCapture);
    pointerEndTarget.removeEventListener('pointerup',pointerEnd,passiveCapture);
    pointerEndTarget.removeEventListener('pointercancel',pointerEnd,passiveCapture);
    target.removeEventListener('lostpointercapture',pointerEnd,passiveCapture);
    ownerWindow?.removeEventListener('blur',resetPointers);
    target.ownerDocument?.removeEventListener('visibilitychange',handleVisibility);
    pointerIds.clear();
  };
}

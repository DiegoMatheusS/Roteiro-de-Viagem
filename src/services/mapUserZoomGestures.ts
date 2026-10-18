/** Detect explicit user map-zoom intents without confusing them with GPS camera moves.
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
    case 'keydown': return ['+','=','-','_'].includes(gesture.key);
  }
}

function isMarkerOrPopup(event:Event):boolean {
  const target=event.target;
  return typeof Element!=='undefined' && target instanceof Element &&
    Boolean(target.closest('.leaflet-marker-icon,.maplibregl-marker,.leaflet-popup,.leaflet-control'));
}

/** Listeners are passive: never block scroll, pinch or map controls.
 * The sole side effect is disabling GPS camera following until recentered.
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
    if(typeof HTMLElement!=='undefined' && event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;
    notify(event,{type:'keydown',key:event.key});
  };
  const pointerDown=(event:PointerEvent)=>{
    if(event.pointerType!=='touch')return;
    pointerIds.add(event.pointerId);
    notify(event,{type:'pointerdown',activeTouchPointers:pointerIds.size});
  };
  const pointerEnd=(event:PointerEvent)=>pointerIds.delete(event.pointerId);
  const passiveCapture={passive:true,capture:true} as const;
  target.addEventListener('wheel',wheel,passiveCapture);
  target.addEventListener('touchstart',touch,passiveCapture);
  target.addEventListener('dblclick',doubleClick,passiveCapture);
  target.addEventListener('gesturestart',gesture,passiveCapture);
  target.addEventListener('keydown',key,true);
  target.addEventListener('pointerdown',pointerDown,passiveCapture);
  target.addEventListener('pointerup',pointerEnd,passiveCapture);
  target.addEventListener('pointercancel',pointerEnd,passiveCapture);
  return ()=>{
    target.removeEventListener('wheel',wheel,true);
    target.removeEventListener('touchstart',touch,true);
    target.removeEventListener('dblclick',doubleClick,true);
    target.removeEventListener('gesturestart',gesture,true);
    target.removeEventListener('keydown',key,true);
    target.removeEventListener('pointerdown',pointerDown,true);
    target.removeEventListener('pointerup',pointerEnd,true);
    target.removeEventListener('pointercancel',pointerEnd,true);
    pointerIds.clear();
  };
}

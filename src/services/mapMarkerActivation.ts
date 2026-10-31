/** Let the map own pan/pinch/wheel from a POI. Only a stationary single tap
 * activates it. Document listeners exist only for the duration of a contact. */
export function bindMapMarkerActivation(element:HTMLElement,activate:()=>void):()=>void {
  const doc=element.ownerDocument;
  let active=false,moved=false,startX=0,startY=0,pointerId:number|undefined;
  const passive={passive:true,capture:true} as const;
  const move=(x:number,y:number)=>{if(active&&Math.hypot(x-startX,y-startY)>8)moved=true;};
  const pointerMove=(event:PointerEvent)=>{if(pointerId===undefined||event.pointerId===pointerId)move(event.clientX,event.clientY);};
  const mouseMove=(event:MouseEvent)=>move(event.clientX,event.clientY);
  const touchMove=(event:TouchEvent)=>{if(event.touches.length>1)moved=true;const first=event.touches[0];if(first)move(first.clientX,first.clientY);};
  const secondPointer=(event:PointerEvent)=>{if(active&&event.pointerType==='touch'&&event.pointerId!==pointerId)moved=true;};
  const secondTouch=(event:TouchEvent)=>{if(active&&event.touches.length>1)moved=true;};
  const detach=()=>{
    doc.removeEventListener('pointermove',pointerMove,passive);doc.removeEventListener('mousemove',mouseMove,passive);
    doc.removeEventListener('touchmove',touchMove,passive);doc.removeEventListener('pointerdown',secondPointer,passive);
    doc.removeEventListener('touchstart',secondTouch,passive);doc.removeEventListener('pointerup',end,passive);
    doc.removeEventListener('mouseup',end,passive);doc.removeEventListener('touchend',end,passive);
    doc.removeEventListener('pointercancel',cancel,passive);doc.removeEventListener('touchcancel',cancel,passive);
    active=false;pointerId=undefined;
  };
  const end=()=>detach();
  const cancel=()=>{moved=true;detach();};
  const start=(x:number,y:number,id?:number)=>{
    if(active)return;
    active=true;moved=false;startX=x;startY=y;pointerId=id;
    doc.addEventListener('pointermove',pointerMove,passive);doc.addEventListener('mousemove',mouseMove,passive);
    doc.addEventListener('touchmove',touchMove,passive);doc.addEventListener('pointerdown',secondPointer,passive);
    doc.addEventListener('touchstart',secondTouch,passive);doc.addEventListener('pointerup',end,passive);
    doc.addEventListener('mouseup',end,passive);doc.addEventListener('touchend',end,passive);
    doc.addEventListener('pointercancel',cancel,passive);doc.addEventListener('touchcancel',cancel,passive);
  };
  const pointer=(event:PointerEvent)=>{if(event.button===0)start(event.clientX,event.clientY,event.pointerId);};
  const mouse=(event:MouseEvent)=>{if(event.button===0)start(event.clientX,event.clientY);};
  const touch=(event:TouchEvent)=>{const first=event.touches[0];if(first)start(first.clientX,first.clientY);if(event.touches.length>1)moved=true;};
  const click=(event:MouseEvent)=>{event.stopPropagation();if(moved){event.preventDefault();return;}activate();};
  const key=(event:KeyboardEvent)=>{
    if(event.target!==element||(event.key!=='Enter'&&event.key!==' '))return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)activate();
  };
  const keypress=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();}};
  element.addEventListener('pointerdown',pointer,{passive:true});element.addEventListener('mousedown',mouse,{passive:true});
  element.addEventListener('touchstart',touch,{passive:true});element.addEventListener('click',click);
  element.addEventListener('keydown',key);element.addEventListener('keypress',keypress,true);
  return ()=>{
    detach();element.removeEventListener('pointerdown',pointer);element.removeEventListener('mousedown',mouse);
    element.removeEventListener('touchstart',touch);element.removeEventListener('click',click);
    element.removeEventListener('keydown',key);element.removeEventListener('keypress',keypress,true);
  };
}

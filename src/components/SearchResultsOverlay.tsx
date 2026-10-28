import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

type OverlayPosition={left:number;top:number;width:number;maxHeight:number};

/** Search suggestions live outside scrollable map sheets, so they can cover
 * other content without being clipped by a panel or the on-screen keyboard. */
export function SearchResultsOverlay({anchorRef,visible,children,onDismiss}: {
  anchorRef:React.RefObject<HTMLElement|null>;
  visible:boolean;
  children:React.ReactNode;
  onDismiss?:()=>void;
}) {
  const [position,setPosition]=useState<OverlayPosition|null>(null);
  const overlayRef=useRef<HTMLDivElement|null>(null);
  const dismissRef=useRef(onDismiss);
  dismissRef.current=onDismiss;

  useEffect(()=>{
    if(!visible||typeof document==='undefined')return;
    const anchor=anchorRef.current;
    if(!anchor)return;
    const update=()=>{
      const rect=anchor.getBoundingClientRect();
      const viewport=window.visualViewport;
      const topLimit=viewport?.offsetTop??0;
      const bottomLimit=topLimit+(viewport?.height??window.innerHeight);
      if(rect.bottom<=topLimit||rect.top>=bottomLimit){setPosition(null);return;}
      const below=Math.max(0,bottomLimit-rect.bottom-12);
      const above=Math.max(0,rect.top-topLimit-12);
      const openAbove=below<220&&above>below;
      const available=openAbove?above:below;
      const maxHeight=Math.max(0,Math.min(380,available-8));
      setPosition(maxHeight<48?null:{
        left:Math.max(8,rect.left),
        top:openAbove?rect.top-8-maxHeight:rect.bottom+8,
        width:Math.max(160,Math.min(rect.width,window.innerWidth-16)),
        maxHeight
      });
    };
    const dismiss=(event:PointerEvent)=>{
      const target=event.target;
      if(target instanceof Node&&!anchor.contains(target)&&!overlayRef.current?.contains(target))dismissRef.current?.();
    };
    update();
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    window.visualViewport?.addEventListener('resize',update);
    window.visualViewport?.addEventListener('scroll',update);
    document.addEventListener('pointerdown',dismiss,true);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    observer?.observe(anchor);
    return()=>{
      window.removeEventListener('resize',update);
      window.removeEventListener('scroll',update,true);
      window.visualViewport?.removeEventListener('resize',update);
      window.visualViewport?.removeEventListener('scroll',update);
      document.removeEventListener('pointerdown',dismiss,true);
      observer?.disconnect();
    };
  },[anchorRef,visible]);

  if(!visible||!position||typeof document==='undefined')return null;
  return createPortal(<div ref={overlayRef} data-testid="search-results-overlay"
    style={{left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,zIndex:175}}
    className="rdv-search-results-overlay fixed overflow-y-auto overscroll-contain rounded-2xl border border-blue-200 bg-white shadow-[0_14px_45px_#0f172a45] text-slate-900"
    role="region" aria-label="Resultados da busca">
    {children}
  </div>,document.body);
}

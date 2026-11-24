import type {Popup} from 'maplibre-gl';

/** All map engines and pin categories share one open balloon per document.
 * Capture clicks even when a marker stops propagation to the map canvas.
 * Keep clicks on the balloon and its own anchor available to their controls. */
const activeBalloons=new WeakMap<Document,{close:()=>void}>();
export function trackMapBalloon(element:HTMLElement,anchor:HTMLElement|null,close:()=>void):()=>void {
  const doc=element.ownerDocument;
  const previous=activeBalloons.get(doc);
  const record={close};
  activeBalloons.set(doc,record);
  previous?.close();
  const outside=(event:MouseEvent)=>{
    if(activeBalloons.get(doc)!==record)return;
    const target=event.target;
    if(target instanceof Node&&(element.contains(target)||anchor?.contains(target)))return;
    close();
  };
  doc.addEventListener('click',outside,true);
  return ()=>{
    doc.removeEventListener('click',outside,true);
    if(activeBalloons.get(doc)===record)activeBalloons.delete(doc);
  };
}

/** Attach before the popup is opened, also for keyboard-activated markers. */
export function bindExclusiveMapLibrePopup(popup:Popup,anchor:HTMLElement):Popup {
  let release:(()=>void)|undefined;
  popup.on('open',()=>{
    release?.();
    release=trackMapBalloon(popup.getElement(),anchor,()=>popup.remove());
  });
  popup.on('close',()=>{release?.();release=undefined;});
  return popup;
}

export interface MarkerPopupAnchor {
  element: HTMLElement;
  mount(content: HTMLElement, onClose: () => void): () => void;
}

/** Own activation locally: marker clicks must not also select a map coordinate. */
export function bindMarkerPopup<T extends {getElement(): HTMLElement; togglePopup(): unknown; getPopup?(): Popup | null}>(marker:T):T {
  const element=marker.getElement();
  const popup=marker.getPopup?.();
  if(popup)bindExclusiveMapLibrePopup(popup,element);
  element.addEventListener('click',event=>{
    event.stopPropagation();
    marker.togglePopup();
  });
  element.addEventListener('keydown',event=>{
    if(event.key!=='Enter' && event.key!==' ')return;
    // Prevent the native button's synthetic click and key-repeat toggles.
    event.preventDefault();event.stopPropagation();
    if(!event.repeat)marker.togglePopup();
  });
  // MapLibre installs its own keypress toggle in setPopup. We own keyboard
  // activation above, including browsers that still dispatch legacy keypress.
  element.addEventListener('keypress',event=>{
    if(event.key!=='Enter' && event.key!==' ')return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  return marker;
}

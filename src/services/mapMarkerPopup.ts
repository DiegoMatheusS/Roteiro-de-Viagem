/** Own activation locally: marker clicks must not also select a map coordinate. */
export function bindMarkerPopup<T extends {getElement(): HTMLElement; togglePopup(): unknown}>(marker:T):T {
  const element=marker.getElement();
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

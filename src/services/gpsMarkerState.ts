/** A lost signal keeps the last observed arrow on the map, visibly stale.
 * This state never feeds the camera, guidance, speed or convoy sharing. */
export function setGpsMarkerState(element:HTMLElement,stale:boolean){
  element.dataset.gpsState=stale?'stale':'live';
  element.setAttribute('aria-label',stale?'Última posição conhecida · aguardando GPS':'Sua posição atual pelo GPS');
  element.title=stale?'Última posição conhecida · aguardando GPS':'Sua Posição Atual (GPS)';
  element.style.filter=stale?'grayscale(1)':'';
  element.style.opacity=stale?'0.65':'1';
}

import {distanceBetweenKm} from './gpsTracking';

/** Keep a circular trip's arrival pin from framing the live GPS arrow. */
export function shouldShowDestinationPin(navigationMode:boolean,destination?:[number,number],live?:[number,number]):boolean {
  return !(navigationMode&&destination&&live&&distanceBetweenKm(destination,live)<=0.025);
}

/** A lost signal keeps the last observed arrow on the map, visibly stale.
 * This state never feeds the camera, guidance, speed or convoy sharing. */
export function setGpsMarkerState(element:HTMLElement,stale:boolean){
  element.dataset.gpsState=stale?'stale':'live';
  element.setAttribute('aria-label',stale?'Última posição conhecida · aguardando GPS':'Sua posição atual pelo GPS');
  element.title=stale?'Última posição conhecida · aguardando GPS':'Sua Posição Atual (GPS)';
  element.style.filter=stale?'grayscale(1)':'';
  element.style.opacity=stale?'0.65':'1';
}

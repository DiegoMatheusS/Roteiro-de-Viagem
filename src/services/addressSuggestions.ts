import type {DeviceLocation} from './locationService';
import {distanceBetweenKm} from './gpsTracking';

/** Geodesic estimate for typeahead results, never road-distance or ETA. */
export function formatAddressDistance(destination:[number,number],gps:DeviceLocation|null|undefined,
  now=Date.now()):string{
  if(!gps||!Array.isArray(destination)||destination.length!==2||!destination.every(Number.isFinite)||
    !gps.coords.every(Number.isFinite)||!Number.isFinite(gps.timestamp)||
    now-gps.timestamp>30000||gps.timestamp>now+5000||
    !Number.isFinite(gps.accuracyMeters)||gps.accuracyMeters<0||gps.accuracyMeters>100)
    return 'Distância indisponível (GPS sem precisão)';
  const distance=distanceBetweenKm(gps.coords,destination);
  return `≈ ${distance.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} km em linha reta`;
}

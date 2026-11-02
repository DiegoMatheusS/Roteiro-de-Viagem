import type {LocationSelection} from '../types/itinerary';
import {requestedHouseNumber} from './locationSuggestions';

/** Remove only the requested house number; preserve the street, city and CEP.
 * Never silently use a street result as the numbered building. */
export function streetQueryForManualPin(query:string):string|null {
  const number=requestedHouseNumber(query);
  if(!number)return null;
  const cleaned=query.trim().replace(/\s+/g,' ');
  const candidates=[...cleaned.matchAll(/(?:,\s*|\s+)(\d{1,6}[a-z]?)(?=\s*(?:,|$))/gi)];
  const numberPart=candidates.findLast(match=>match[1].toLowerCase()===number);
  if(!numberPart||numberPart.index===undefined)return null;
  const street=(cleaned.slice(0,numberPart.index)+cleaned.slice(numberPart.index+numberPart[0].length))
    .replace(/\s+,/g,',').replace(/,\s*,/g,',').replace(/,\s*$/,'').trim();
  return street.length>=3&&street!==cleaned?street:null;
}

/** Manual coordinates belong to the traveler, not to an alleged provider result. */
export function manuallySelectedAddress(query:string,coords:[number,number]):LocationSelection {
  if(!streetQueryForManualPin(query)||!coords.every(Number.isFinite)||
    Math.abs(coords[0])>90||Math.abs(coords[1])>180)
    throw new Error('Informe uma rua com número e marque um ponto válido no mapa.');
  const label=query.trim().replace(/\s+/g,' ');
  return {name:label,address:label,coords,category:'manual'};
}

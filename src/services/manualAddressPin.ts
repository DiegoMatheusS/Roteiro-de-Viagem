import type {LocationSelection} from '../types/itinerary';
import {requestedHouseNumber} from './locationSuggestions';

/** Search for the street without treating the house number as a provider-confirmed location.
 * An address without a number is also valid when the traveler chooses the position manually. */
export function streetQueryForManualPin(query:string):string|null {
  const cleaned=query.trim().replace(/\s+/g,' ');
  if(cleaned.length<3||cleaned.length>150)return null;
  const number=requestedHouseNumber(cleaned);
  if(!number)return cleaned;
  const candidates=[...cleaned.matchAll(/(?:,\s*|\s+)(\d{1,6}[a-z]?)(?=\s*(?:,|$))/gi)];
  const numberPart=candidates.findLast(match=>match[1].toLowerCase()===number);
  if(!numberPart||numberPart.index===undefined)return cleaned;
  const street=(cleaned.slice(0,numberPart.index)+cleaned.slice(numberPart.index+numberPart[0].length))
    .replace(/\s+,/g,',').replace(/,\s*,/g,',').replace(/,\s*$/,'').trim();
  return street.length>=3?street:cleaned;
}

/** A manually confirmed location is never presented as an independently verified house number. */
export function manuallySelectedAddress(query:string,coords:[number,number]):LocationSelection {
  if(!streetQueryForManualPin(query)||!coords.every(Number.isFinite)||
    Math.abs(coords[0])>90||Math.abs(coords[1])>180)
    throw new Error('Informe o endereço e marque um ponto válido no mapa.');
  const label=query.trim().replace(/\s+/g,' ');
  return {name:label,address:label,coords,category:'manual'};
}

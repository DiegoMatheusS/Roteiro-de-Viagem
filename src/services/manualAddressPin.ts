import type {LocationSelection} from '../types/itinerary';
import {requestedHouseNumber} from './locationSuggestions';

/** Search for the street without treating the house number as a provider-confirmed location.
 * An address without a number is also valid when the traveler chooses the position manually. */
export function streetQueryForManualPin(query:string):string|null {
  const cleaned=query.trim().replace(/\s+/g,' ');
  if(cleaned.length<3||cleaned.length>150)return null;
  const number=requestedHouseNumber(cleaned);
  if(!number)return cleaned;
  const candidates=[
    ...cleaned.matchAll(/(?:,\s*|\s+)(?:n[º°.]?|número|numero|#)\s*(\d{1,6}[a-z]?)(?=\s*(?:,|$))/gi),
    ...cleaned.matchAll(/(?:,\s*|\s+)(\d{1,6}[a-z]?)(?=\s*(?:,|$))/gi)
  ];
  const numberPart=candidates.reverse().find(match=>match[1].toLowerCase()===number);
  if(!numberPart||numberPart.index===undefined)return cleaned;
  const street=(cleaned.slice(0,numberPart.index)+cleaned.slice(numberPart.index+numberPart[0].length))
    .replace(/\s+,/g,',').replace(/,\s*,/g,',').replace(/,\s*$/,'').trim();
  return street.length>=3?street:cleaned;
}

/** Add the house number only after the user has placed the pin.
 * Keep any supplied city/bairro and never claim the number was verified. */
export function manuallySelectedAddress(query:string,coords:[number,number],houseNumber?:string):LocationSelection {
  const street=streetQueryForManualPin(query);
  if(!street||!coords.every(Number.isFinite)||
    Math.abs(coords[0])>90||Math.abs(coords[1])>180)
    throw new Error('Informe o endereço e marque um ponto válido no mapa.');
  const number=(houseNumber??requestedHouseNumber(query)??'').trim();
  if(number&&!/^\d{1,6}[a-z]?$/i.test(number))
    throw new Error('Informe um número válido ou deixe o campo vazio.');
  const pieces=street.split(',').map(v=>v.trim()).filter(Boolean);
  const label=number?[pieces[0],number,...pieces.slice(1)].join(', '):street;
  return {name:label,address:label,coords,category:'manual'};
}

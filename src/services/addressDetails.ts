import type {AddressParts} from '../types/address';
import type {LocationSelection} from '../types/itinerary';
import {normalizeAddressText,requestedHouseNumber} from './locationSuggestions';

const states=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
export const normalizePostcode=(value:string)=>value.replace(/\D/g,'');
export const requestedPostcode=(query:string):string|null=>{
  const found=query.match(/\b(\d{5})[-\s]?(\d{3})\b/);return found?found[1]+found[2]:null;
};
export function matchingPostcode(place:LocationSelection,postcode:string):boolean {
  return normalizePostcode(place.addressParts?.postcode||parseAddressParts(place.address||'').postcode||'')===postcode;
}
/** Preserve what the source actually says. Missing fields stay absent. */
export function parseAddressParts(address:string):AddressParts {
  const parts:AddressParts={},pieces=address.split(',').map(value=>value.trim()).filter(Boolean);
  const zip=address.match(/\b(\d{5})[-\s]?(\d{3})\b/);
  if(zip)parts.postcode=zip[1]+zip[2];
  const rest=pieces.filter(piece=>{
    if(/^(?:brasil|brazil)$/i.test(piece)){parts.country=piece;return false;}
    if(states.has(piece)){parts.state=piece;return false;}
    return !/^\d{5}[-\s]?\d{3}$/.test(piece);
  });
  if(/^(?:rua|r\.?|avenida|av\.?|alameda|travessa|estrada|rodovia|praça|praca|viela|largo)\s+/i.test(rest[0]||'')){
    const first=rest.shift()!;
    const number=requestedHouseNumber(address);
    parts.street=number?first.replace(new RegExp(`(?:\\s+(?:n[º°.]?|número|numero|#))?\\s+${number}$`,'i'),'').trim():first;
    if(number){parts.houseNumber=number;if(rest[0]?.toLowerCase()===number)rest.shift();}
    // Multiple unlabeled city/state components are ambiguous without a UF.
    if(parts.state||rest.length===1){
      if(rest.length)parts.city=rest.at(-1);
      if(rest.length>1)parts.neighborhood=rest.slice(0,-1).join(', ');
    }
  }
  return parts;
}
export function addressSearchText(name:string,address:string,parts:AddressParts={}):string {
  // Both CEP spellings share the same indexed token; abbreviations and accents
  // are normalized the same way in the app and in SQLite's search index.
  return normalizeAddressText([name,address,...Object.values(parts)].join(' ')
    .replace(/\b(\d{5})[-\s]?(\d{3})\b/g,'$1$2'));
}
export function addressQueryTokens(query:string):string[]{
  return [...new Set(addressSearchText('',query).split(' ').filter(token=>token&&!['de','da','do','das','dos','e'].includes(token)))].slice(0,24);
}
export function addressMatches(query:string,place:LocationSelection,alias=''):boolean {
  const words=addressSearchText(place.name,`${place.address||''} ${alias}`,place.addressParts).split(' ');
  return addressQueryTokens(query).every(token=>words.some(word=>word===token||(!/^\d+$/.test(token)&&word.startsWith(token))));
}

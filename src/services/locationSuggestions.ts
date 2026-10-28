import type {LocationSelection} from '../types/itinerary';
import {distanceBetweenKm} from './gpsTracking';

export function normalizeAddressText(value:string):string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').trim()
    .replace(/\b(av|avda)\b/g,'avenida').replace(/\br\b/g,'rua')
    .replace(/\brod\b/g,'rodovia').replace(/\bestr\b/g,'estrada').replace(/\bpca\b/g,'praca');
}

/** Match the written address first; proximity only breaks comparable matches.
 * Never move a nearby namesake ahead of an explicitly requested city/number. */
export function rankLocationSuggestions(query:string,places:LocationSelection[],bias?:[number,number]):LocationSelection[] {
  const normalized=normalizeAddressText(query);
  const tokens=normalized.split(' ').filter(token=>token&&!['de','da','do','das','dos','e'].includes(token));
  const ids=new Set<string>(),fingerprints=new Set<string>();
  return places.flatMap((place,index)=>{
    const name=normalizeAddressText(place.name),address=normalizeAddressText(place.address||'');
    const fingerprint=JSON.stringify([name,address,place.coords?.map(v=>v.toFixed(4))]);
    if((place.id&&ids.has(place.id))||fingerprints.has(fingerprint))return [];
    if(place.id)ids.add(place.id);fingerprints.add(fingerprint);
    const words=new Set((name+' '+address).split(' '));
    const matches=tokens.filter(token=>words.has(token)||(!/^\d+$/.test(token)&&token.length>=3&&[...words].some(word=>word.startsWith(token)))).length;
    const score=matches*100+(name===normalized?60:name.startsWith(normalized)?30:0)+(address.includes(normalized)?20:0);
    return [{place,index,score,distance:bias&&place.coords?distanceBetweenKm(bias,place.coords):Infinity}];
  }).sort((a,b)=>b.score-a.score||(Number.isFinite(a.distance)&&Number.isFinite(b.distance)?a.distance-b.distance:0)||a.index-b.index)
    .map(item=>item.place);
}

/** Preserve only provider fields: never invent a house number or neighbourhood. */
export function providerAddressLabel(p:Record<string,unknown>):{name:string;address:string} {
  const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
  const street=text(p.street),number=text(p.housenumber),providerName=text(p.name);
  const address=[street,number,text(p.district||p.suburb||p.neighbourhood),text(p.city||p.locality),
    text(p.state),text(p.postcode),text(p.country)].filter(Boolean).join(', ').slice(0,350);
  const name=(providerName&&normalizeAddressText(providerName)!==normalizeAddressText(street)
    ?providerName:[street,number].filter(Boolean).join(', '))||text(p.city||p.locality)||address;
  return {name:name.slice(0,150),address};
}

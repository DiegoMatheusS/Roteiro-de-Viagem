import type {LocationSelection} from '../types/itinerary';
import {storageService} from './storageService';
import {fuelApi} from './fuelApi';
import {EXPLORE_CATALOG} from '../catalogs/explore';
import {addressMatches,addressSearchText,parseAddressParts,requestedPostcode} from './addressDetails';
import {rankLocationSuggestions,requestedHouseNumber} from './locationSuggestions';
import {readSavedAddresses} from './savedAddresses';

type RememberedAddress={selection:LocationSelection;aliases:string[];savedAt:string;pending?:boolean};
const key=(owner:string|null)=>`role:address-history:v1:${encodeURIComponent(owner||'guest')}`;
const valid=(place:LocationSelection)=>Boolean(place&&typeof place.name==='string'&&place.name.length>=3&&place.name.length<=150&&
  (!place.address||typeof place.address==='string'&&place.address.length<=350)&&Array.isArray(place.coords)&&place.coords.length===2&&
  place.coords.every(Number.isFinite)&&Math.abs(place.coords[0])<=90&&Math.abs(place.coords[1])<=180&&!place.requiresPin);
function read(owner=storageService.getScope()):RememberedAddress[]{
  try{const rows=JSON.parse(localStorage.getItem(key(owner))||'[]');return Array.isArray(rows)?rows.filter(row=>valid(row?.selection)&&Array.isArray(row.aliases)&&row.aliases.every((alias:unknown)=>typeof alias==='string')).slice(0,200):[];}
  catch{return [];}
}
export function readAddressHistory():LocationSelection[]{return read().map(row=>row.selection);}
const identity=(place:LocationSelection)=>JSON.stringify([addressSearchText(place.name,place.address||'',place.addressParts),place.coords]);
async function persist(row:RememberedAddress,owner:string){
  await fuelApi('/me/addresses',{method:'POST',body:JSON.stringify({selection:row.selection,query:row.aliases[0],accountId:owner})});
  try{const id=identity(row.selection);localStorage.setItem(key(owner),JSON.stringify(read(owner).map(item=>
    identity(item.selection)===id&&item.savedAt===row.savedAt?{...item,pending:false}:item)));}catch{/* Keep the pending entry when storage is unavailable. */}
}
const syncing=new Set<string>();
export async function syncAddressHistory():Promise<void>{
  const owner=storageService.getScope();if(!owner||syncing.has(owner))return;
  syncing.add(owner);
  try{for(const row of read(owner).filter(item=>item.pending).slice(0,20)){
    if(storageService.getScope()!==owner)return;
    try{await persist(row,owner);}catch{return;}
  }}finally{syncing.delete(owner);}
}

/** Only a chosen address enters history. Draft keystrokes and live GPS fixes
 * are not addresses. Account namespaces never fall back to another account. */
export function rememberAddress(place:LocationSelection,query:string):void {
  if(!valid(place)||!query.trim())return;
  const owner=storageService.getScope();
  const selection={...place,addressParts:{...parseAddressParts(place.address||''),...place.addressParts}};
  const id=identity(selection),previous=read(owner),old=previous.find(row=>identity(row.selection)===id);
  const row:RememberedAddress={selection,aliases:[...new Set([query.trim().slice(0,150),...(old?.aliases||[])])].slice(0,5),savedAt:new Date().toISOString(),pending:Boolean(owner)};
  try{localStorage.setItem(key(owner),JSON.stringify([row,...previous.filter(item=>identity(item.selection)!==id)].slice(0,200)));}
  catch{/* Device storage errors must not block planning. */}
  if(owner)void persist(row,owner)
    .catch(()=>{/* Local history remains usable without the server. */});
}
const catalog:LocationSelection[]=EXPLORE_CATALOG.map(place=>({id:place.id,name:place.name,address:place.address,coords:place.coords,
  category:place.kind,sourceUrl:place.sourceUrl||place.coordinateSource,addressParts:{...parseAddressParts(place.address),city:place.city||undefined}}));
export function storedAddressMatches(query:string,bias?:[number,number]):{results:LocationSelection[];exact:boolean}{
  const remembered=read().filter(row=>addressMatches(query,row.selection,row.aliases.join(' ')));
  const saved=readSavedAddresses(storageService.getScope()).map(item=>({name:item.address,address:item.address,coords:item.coords,
    category:'manual',addressParts:parseAddressParts(item.address)})).filter(place=>addressMatches(query,place));
  const known=catalog.filter(place=>addressMatches(query,place));
  const normalized=addressSearchText('',query);
  const results=rankLocationSuggestions(query,[...remembered.map(row=>row.selection),...saved,...known],bias).slice(0,10);
  const complete=Boolean(requestedHouseNumber(query)||requestedPostcode(query));
  const exact=remembered.some(row=>[row.selection.name,row.selection.address||'',...(complete?row.aliases:[])].some(value=>addressSearchText('',value)===normalized))||
    [...saved,...known].some(place=>[place.name,place.address||''].some(value=>addressSearchText('',value)===normalized));
  const knownPostcode=/^\d{5}[-\s]?\d{3}$/.test(query.trim())&&Boolean(results.length);
  return {results,exact:exact||knownPostcode};
}
export async function clearAddressHistory():Promise<void>{
  const owner=storageService.getScope();
  if(owner)await fuelApi('/me/addresses',{method:'DELETE'});
  try{localStorage.removeItem(key(owner));}catch{/* Storage unavailable. */}
}

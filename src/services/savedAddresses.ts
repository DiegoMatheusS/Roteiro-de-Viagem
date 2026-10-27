import type {DeviceLocation} from './locationService';
import {distanceBetweenKm} from './gpsTracking';

export const SAVED_ADDRESS_TYPES=['Casa','Trabalho','Escola','Faculdade','Sogra','Outro'] as const;
export type SavedAddressType=typeof SAVED_ADDRESS_TYPES[number];
export interface SavedAddress {
  id:string;
  label:string;
  address:string;
  coords:[number,number];
}

const KEY_PREFIX='rdv_saved_addresses_v1:';
const MAX_ADDRESSES=30;
const validCoords=(p:unknown):p is [number,number]=>Array.isArray(p)&&p.length===2&&
  p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const validAddress=(p:unknown):p is SavedAddress=>Boolean(
  p&&typeof p==='object'&&
  typeof (p as SavedAddress).id==='string'&&(p as SavedAddress).id.length<150&&
  typeof (p as SavedAddress).label==='string'&&(p as SavedAddress).label.trim().length>0&&
  (p as SavedAddress).label.length<=55&&
  typeof (p as SavedAddress).address==='string'&&(p as SavedAddress).address.trim().length>0&&
  (p as SavedAddress).address.length<=250&&validCoords((p as SavedAddress).coords)
);
/** Scoped to the signed-in account on this device; never store home addresses in a shared guest key. */
export function readSavedAddresses(userId:string|null|undefined):SavedAddress[]{
  if(!userId||typeof localStorage==='undefined')return [];
  try{
    const value=JSON.parse(localStorage.getItem(KEY_PREFIX+encodeURIComponent(userId))||'[]');
    return Array.isArray(value)?value.filter(validAddress).slice(0,MAX_ADDRESSES):[];
  }catch{return [];}
}
export function saveAddress(userId:string,record:Omit<SavedAddress,'id'>):SavedAddress[]{
  if(!userId)throw new Error('Entre na sua conta para salvar um endereço.');
  const label=record.label.trim(),address=record.address.trim();
  if(!label||label.length>55||!address||address.length>250||!validCoords(record.coords))
    throw new Error('Escolha um nome e um endereço válido nos resultados da pesquisa.');
  const previous=readSavedAddresses(userId);
  // Re-saving Casa, Trabalho etc. replaces the old location rather than creating ambiguous matches.
  const existing=previous.find(item=>item.label.toLocaleLowerCase('pt-BR')===label.toLocaleLowerCase('pt-BR'));
  const saved:SavedAddress={id:existing?.id??String(Date.now())+'-'+Math.random().toString(36).slice(2,8),
    label,address,coords:[...record.coords]};
  const updated=[saved,...previous.filter(item=>item.id!==existing?.id)].slice(0,MAX_ADDRESSES);
  localStorage.setItem(KEY_PREFIX+encodeURIComponent(userId),JSON.stringify(updated));
  return updated;
}
export function deleteSavedAddress(userId:string,id:string):SavedAddress[]{
  if(!userId)return [];
  const next=readSavedAddresses(userId).filter(item=>item.id!==id);
  localStorage.setItem(KEY_PREFIX+encodeURIComponent(userId),JSON.stringify(next));
  return next;
}
/** Only a recent accurate, near-stationary fix may name/snap a trip origin.
 * This does NOT change the GPS marker or claim improved device accuracy.
 * A weak/ambiguous fix falls back to the actual GPS coordinates. */
export function matchSavedAddressOrigin(fix:DeviceLocation|null|undefined,
  items:readonly SavedAddress[],now=Date.now()):SavedAddress|null{
  if(!fix||!Number.isFinite(fix.timestamp)||fix.timestamp>now+5000||now-fix.timestamp>30000||
     !Number.isFinite(fix.accuracyMeters)||fix.accuracyMeters<0||fix.accuracyMeters>35||
     !validCoords(fix.coords)|| (fix.speedMetersPerSecond!=null&&fix.speedMetersPerSecond>2))return null;
  const maximumDistance=Math.min(60,Math.max(30,fix.accuracyMeters+25));
  const candidates=items.filter(item=>validAddress(item)).map(item=>({
    item,meters:distanceBetweenKm(fix.coords,item.coords)*1000
  })).filter(candidate=>candidate.meters<=maximumDistance).sort((a,b)=>a.meters-b.meters);
  if(candidates.length>1&&candidates[1].meters-candidates[0].meters<15)return null;
  return candidates[0]?.item??null;
}

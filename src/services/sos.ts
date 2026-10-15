import type { DeviceLocation } from './locationService';
import { isNativeApp,TravelNative } from './nativeApp';
export function normalizeContactPhone(value:string){
  const text=value.trim(),digits=text.replace(/\D/g,'');
  if(text.startsWith('+')&&digits.length>=8&&digits.length<=15)return '+'+digits;
  if((digits.length===12||digits.length===13)&&digits.startsWith('55'))return '+'+digits;
  if(digits.length===10||digits.length===11)return '+55'+digits;
  throw new Error('Informe um telefone com DDD ou um número internacional começando com +.');
}
export function isFreshSosLocation(position:DeviceLocation|null,now=Date.now()){
  return !!position&&now-position.timestamp>=-5000&&now-position.timestamp<=60000&&position.accuracyMeters>=0&&Number.isFinite(position.accuracyMeters)&&position.coords.length===2&&position.coords.every((n,i)=>Number.isFinite(n)&&Math.abs(n)<=(i?180:90));
}
export function sosMessage(position:DeviceLocation){
  if(!isFreshSosLocation(position))throw new Error('Aguarde uma localização GPS recente antes de compartilhar.');
  return `🚨 Preciso de ajuda na estrada. Localização GPS: https://maps.google.com/?q=${position.coords[0]},${position.coords[1]} · Precisão aproximada: ${Math.round(position.accuracyMeters)} m · Coletada em ${new Date(position.timestamp).toLocaleString('pt-BR')}.`;
}
export async function openSosLink(url:string){
  if(isNativeApp()){await TravelNative.openExternal({url});return;}
  if(url.startsWith('tel:')){window.location.href=url;return;}
  const popup=window.open(url,'_blank','noopener,noreferrer');
  // Some browsers return null for a successful noopener window. Do not open a second tab.
  void popup;
}
export function whatsAppSosUrl(position:DeviceLocation,phone?:string){
  return `https://api.whatsapp.com/send?${phone?`phone=${normalizeContactPhone(phone).replace('+','')}&`:''}text=${encodeURIComponent(sosMessage(position))}`;
}
export async function copySosMessage(position:DeviceLocation){const text=sosMessage(position);if(isNativeApp())await TravelNative.copyText({text});else await navigator.clipboard.writeText(text);}

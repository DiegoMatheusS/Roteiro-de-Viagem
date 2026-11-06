import {fuelApi,FuelApiError} from './fuelApi';
import type {LocationSelection} from '../types/itinerary';
import {matchingHouseNumber,rankLocationSuggestions,requestedHouseNumber} from './locationSuggestions';
import {isStreetOnlyReference,streetQueryForManualPin} from './manualAddressPin';
import {storedAddressMatches} from './addressMemory';
import {matchingPostcode,requestedPostcode} from './addressDetails';

export function houseNumberNotFoundMessage(number:string):string {
  return `Não localizamos o imóvel nº ${number}. Confira a rua e a cidade; não vamos usar outro número.`;
}

/** Bound the wait on both fetch and the Android bridge. The bridge cannot
 * cancel a running HTTP call; late responses must still be ignored by callers. */
export async function searchLocations(query:string,bias?:[number,number],signal?:AbortSignal){
  if(signal?.aborted)throw new Error('Busca cancelada.');
  const stored=storedAddressMatches(query,bias);
  const wanted=requestedHouseNumber(query);
  const postcode=requestedPostcode(query);
  const exactStored=stored.results.filter(place=>(!wanted||matchingHouseNumber(place,wanted))&&(!postcode||matchingPostcode(place,postcode)));
  if(stored.exact&&exactStored.length)return {results:exactStored,streetResults:[] as LocationSelection[],unmatchedHouseNumber:null,cached:true,source:'device',unavailable:false};
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let cancel:()=>void=()=>{};
  const cancelled=new Promise<never>((_,reject)=>{
    cancel=()=>{controller.abort();reject(new Error('Busca cancelada.'));};
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>{
      controller.abort();
      reject(new Error('A busca demorou para responder. Confira sua conexão e tente novamente.'));
    },20_000);
  });
  try{
    const request=()=>fuelApi<{results:LocationSelection[];unavailable?:boolean}>(
      `/addresses/search?q=${encodeURIComponent(query.trim().replace(/\s+/g,' '))}${bias?`&lat=${bias[0]}&lng=${bias[1]}`:''}`,
      {signal:controller.signal});
    const queryResult=async()=>{
      try{return await request();}
      catch(error){
        if(!(error instanceof FuelApiError)||error.status!==429||controller.signal.aborted)throw error;
        // A busy own server may rate-limit a burst. Retry once,
        // and cancel that wait immediately when a newer query replaces it.
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(delay);reject(new Error('Busca cancelada.'));};
          const delay=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},1200);
          controller.signal.addEventListener('abort',abort,{once:true});
        });
        return request();
      }
    };
    let result:{results:LocationSelection[];unavailable?:boolean};
    try{result=await Promise.race([cancelled,queryResult()]);}
    catch(error){if(signal?.aborted||!stored.results.length)throw error;result={results:stored.results,unavailable:true};}
    if(!Array.isArray(result.results))throw new Error('Não foi possível pesquisar este endereço. Tente novamente.');
    const valid=[...stored.results,...result.results].filter(place=>typeof place?.name==='string'&&
      Array.isArray(place.coords)&&place.coords.length===2&&place.coords.every(Number.isFinite)&&
      Math.abs(place.coords[0])<=90&&Math.abs(place.coords[1])<=180&&(!postcode||matchingPostcode(place,postcode)));
    const requestedNumber=requestedHouseNumber(query);
    const numbered=requestedNumber?valid.filter(place=>matchingHouseNumber(place,requestedNumber)):valid;
    // Keep street-level matches separately so the UI can open the center-pin picker.
    // They must never be returned as a routable numbered property.
    const streetResults=requestedNumber&&numbered.length===0
      ?rankLocationSuggestions(streetQueryForManualPin(query)??query,valid.filter(isStreetOnlyReference),bias):[];
    return {...result,results:rankLocationSuggestions(query,numbered,bias),streetResults,
      unmatchedHouseNumber:requestedNumber&&numbered.length===0?requestedNumber:null};
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  }
}

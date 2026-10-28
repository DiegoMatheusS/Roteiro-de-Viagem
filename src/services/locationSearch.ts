import {fuelApi,FuelApiError} from './fuelApi';
import type {LocationSelection} from '../types/itinerary';
import {rankLocationSuggestions} from './locationSuggestions';

/** Bound the wait on both fetch and the Android bridge. The bridge cannot
 * cancel a running HTTP call; late responses must still be ignored by callers. */
export async function searchLocations(query:string,bias?:[number,number],signal?:AbortSignal){
  if(signal?.aborted)throw new Error('Busca cancelada.');
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
      `/locations/search?q=${encodeURIComponent(query.trim().replace(/\s+/g,' '))}${bias?`&lat=${bias[0]}&lng=${bias[1]}`:''}`,
      {signal:controller.signal});
    const queryResult=async()=>{
      try{return await request();}
      catch(error){
        if(!(error instanceof FuelApiError)||error.status!==429||controller.signal.aborted)throw error;
        // Typing can overlap the provider's one-second spacing. Retry once,
        // and cancel that wait immediately when a newer query replaces it.
        await new Promise<void>((resolve,reject)=>{
          const abort=()=>{clearTimeout(delay);reject(new Error('Busca cancelada.'));};
          const delay=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},1200);
          controller.signal.addEventListener('abort',abort,{once:true});
        });
        return request();
      }
    };
    const result=await Promise.race([cancelled,
      queryResult()]);
    if(!Array.isArray(result.results))throw new Error('Não foi possível pesquisar este endereço. Tente novamente.');
    return {...result,results:rankLocationSuggestions(query,result.results.filter(place=>typeof place?.name==='string'&&
      Array.isArray(place.coords)&&place.coords.length===2&&place.coords.every(Number.isFinite)&&
      Math.abs(place.coords[0])<=90&&Math.abs(place.coords[1])<=180),bias)};
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  }
}

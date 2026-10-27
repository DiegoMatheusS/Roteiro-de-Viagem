import {fuelApi} from './fuelApi';
import type {LocationSelection} from '../types/itinerary';

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
    const result=await Promise.race([cancelled,
      fuelApi<{results:LocationSelection[];unavailable?:boolean}>(
        `/locations/search?q=${encodeURIComponent(query.trim())}${bias?`&lat=${bias[0]}&lng=${bias[1]}`:''}`,
        {signal:controller.signal})]);
    if(!Array.isArray(result.results))throw new Error('Não foi possível pesquisar este endereço. Tente novamente.');
    return {...result,results:result.results.filter(place=>typeof place?.name==='string'&&
      Array.isArray(place.coords)&&place.coords.length===2&&place.coords.every(Number.isFinite)&&
      Math.abs(place.coords[0])<=90&&Math.abs(place.coords[1])<=180)};
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  }
}

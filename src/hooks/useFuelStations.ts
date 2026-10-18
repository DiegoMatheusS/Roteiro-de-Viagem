import { useEffect, useMemo, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import type { FuelStation } from '../types/fuel';

// Same-route results may be reused. Never show a previous route's fuel markers
// while a different route is loading (or when fuel discovery is disabled).
const cache = new Map<string,{stations:FuelStation[];error:string|null;until:number}>();
const OK_TTL = 120_000;
const FAILURE_BACKOFF = 180_000;
type FuelView = {key:string;stations:FuelStation[];error:string|null;loading:boolean};

export function useFuelStations(points: [number, number][], enabled = true) {
  const sampled=sampleRoutePath(points);
  const key=JSON.stringify(sampled);
  const [attempt,setAttempt]=useState(0);
  const initial=useMemo(()=>cache.get(key),[key]);
  const [view,setView]=useState<FuelView>(()=>({
    key,stations:initial?.stations||[],error:initial?.error||null,loading:false
  }));
  useEffect(()=>{
    if(!enabled||!sampled.length){
      setView({key,stations:[],error:null,loading:false});
      return;
    }
    const cached=cache.get(key);
    if(attempt===0 && cached && cached.until>Date.now()){
      setView({key,stations:cached.stations,error:cached.error,loading:false});
      return;
    }
    const controller=new AbortController();
    setView({key,stations:cached?.stations||[],error:null,loading:true});
    fuelApi<{stations:FuelStation[];mapUnavailable:boolean}>('/stations/search',{
      method:'POST',body:JSON.stringify({points:sampled}),signal:controller.signal
    }).then(result=>{
      if(controller.signal.aborted)return;
      const fresh=Array.isArray(result.stations)?result.stations:[];
      const stations=result.mapUnavailable && !fresh.length && cached?.stations.length?cached.stations:fresh;
      const error=result.mapUnavailable?
        'Consulta de postos temporariamente indisponível. Exibindo somente dados já conhecidos.':null;
      cache.set(key,{stations,error,until:Date.now()+(result.mapUnavailable?FAILURE_BACKOFF:OK_TTL)});
      if(cache.size>40)cache.delete(cache.keys().next().value!);
      setView({key,stations,error,loading:false});
    }).catch(failure=>{
      if(controller.signal.aborted)return;
      const error=(failure as Error).message;
      const stations=cached?.stations||[];
      cache.set(key,{stations,error,until:Date.now()+FAILURE_BACKOFF});
      if(cache.size>40)cache.delete(cache.keys().next().value!);
      setView({key,stations,error,loading:false});
    });
    return ()=>controller.abort();
    // key is the complete sampled route. attempt explicitly bypasses the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,enabled,attempt]);

  // Keyed results eliminate a render of old-region markers before the effect
  // starts, and prevent late responses from replacing the new region.
  const active=enabled && sampled.length>0;
  const shown=active
    ? view.key===key?view:{key,stations:initial?.stations||[],error:initial?.error||null,loading:false}
    : {key,stations:[] as FuelStation[],error:null,loading:false};
  return {stations:shown.stations,error:shown.error,loading:shown.loading,
    retry:()=>setAttempt(value=>value+1)};
}

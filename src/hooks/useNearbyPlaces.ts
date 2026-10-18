import {useEffect,useMemo,useState} from 'react';
import {fuelApi} from '../services/fuelApi';
import {sampleRoutePath} from '../types/itinerary';
import type {Place} from '../types/admin';

// The displayed places belong to one sampled itinerary. A new area must not
// inherit the old area's markers, including before React runs its next effect.
const cache=new Map<string,{places:Place[];until:number}>();
const OK_TTL=120_000,FAILURE_TTL=30_000;
type PlaceView={key:string;places:Place[]};

export function useNearbyPlaces(points:[number,number][],enabled:boolean){
  const sampled=sampleRoutePath(points);
  const key=JSON.stringify(sampled);
  const initial=useMemo(()=>cache.get(key),[key]);
  const [view,setView]=useState<PlaceView>(()=>({key,places:initial?.places||[]}));
  useEffect(()=>{
    if(!enabled||!sampled.length){setView({key,places:[]});return;}
    const cached=cache.get(key);
    if(cached && cached.until>Date.now()){
      setView({key,places:cached.places});
      return;
    }
    const controller=new AbortController();
    setView({key,places:cached?.places||[]});
    fuelApi<{places:Place[]}>('/places/search',{
      method:'POST',body:JSON.stringify({points:sampled}),signal:controller.signal
    }).then(result=>{
      if(controller.signal.aborted)return;
      const places=Array.isArray(result.places)?result.places:[];
      cache.set(key,{places,until:Date.now()+OK_TTL});
      if(cache.size>40)cache.delete(cache.keys().next().value!);
      setView({key,places});
    }).catch(()=>{
      if(controller.signal.aborted)return;
      const places=cached?.places||[];
      cache.set(key,{places,until:Date.now()+FAILURE_TTL});
      if(cache.size>40)cache.delete(cache.keys().next().value!);
      setView({key,places});
    });
    return ()=>controller.abort();
    // key already includes the sampled itinerary; no fetch on equivalent input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,enabled]);
  if(!enabled||!sampled.length)return [];
  return view.key===key?view.places:initial?.places||[];
}

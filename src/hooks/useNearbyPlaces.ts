import {useEffect,useMemo,useState} from 'react';
import {fuelApi} from '../services/fuelApi';
import {sampleRoutePath} from '../types/itinerary';
import type {Place} from '../types/admin';
import {retainedPlacesWithinBounds,type PlaceBounds} from '../services/mapPlaceViewport';
import {bindPlaceRefresh} from '../services/placeRefresh';

// The displayed places belong to one sampled itinerary. A new area must not
// inherit the old area's markers, including before React runs its next effect.
const cache=new Map<string,{places:Place[];until:number}>();
const OK_TTL=120_000,FAILURE_TTL=30_000;
type PlaceView={key:string;places:Place[]};

export function useNearbyPlaces(points:[number,number][],enabled:boolean,radiusKm=5,options?:{bounds?:PlaceBounds;refreshMs?:number;includeFuel?:boolean}){
  const sampled=sampleRoutePath(points);
  const key=JSON.stringify([radiusKm,sampled,options?.bounds,options?.includeFuel]);
  const initial=useMemo(()=>cache.get(key),[key]);
  const [view,setView]=useState<PlaceView>(()=>({key,places:initial?.places||[]}));
  useEffect(()=>{
    if(!enabled||!sampled.length){setView({key,places:[]});return;}
    let disposed=false;
    let controller:AbortController|null=null;
    let cached=cache.get(key);
    // A zoom or small pan keeps the last known points inside the new bounds.
    const startingPlaces=cached?.places??retainedPlacesWithinBounds(view.places,options?.bounds);
    setView({key,places:startingPlaces});
    const pause=()=>{controller?.abort();controller=null;};
    const load=(fresh=false)=>{
      if(disposed||document.hidden||navigator.onLine===false||controller)return;
      cached=cache.get(key);
      if(!fresh&&cached&&cached.until>Date.now()){
        setView({key,places:cached.places});return;
      }
      const request=new AbortController();controller=request;
      fuelApi<{places:Place[]}>('/places/search',{
        method:'POST',body:JSON.stringify({points:sampled,radiusKm,bounds:options?.bounds,includeFuel:options?.includeFuel}),signal:request.signal
      }).then(result=>{
        if(disposed||request.signal.aborted)return;
        const places=Array.isArray(result.places)?result.places:[];
        cache.set(key,{places,until:Date.now()+OK_TTL});
        if(cache.size>40)cache.delete(cache.keys().next().value!);
        setView({key,places});
      }).catch(()=>{
        if(disposed||request.signal.aborted)return;
        const places=cached?.places??startingPlaces;
        cache.set(key,{places,until:Date.now()+FAILURE_TTL});
        if(cache.size>40)cache.delete(cache.keys().next().value!);
        setView({key,places});
      }).finally(()=>{if(controller===request)controller=null;});
    };
    load();
    const stop=options?.refreshMs?bindPlaceRefresh(document,window,()=>load(true),pause,options.refreshMs):
      bindPlaceRefresh(document,window,()=>load(),pause,OK_TTL);
    return ()=>{disposed=true;pause();stop();};
    // key already includes the sampled itinerary; no fetch on equivalent input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,enabled,options?.refreshMs]);
  if(!enabled||!sampled.length)return [];
  return view.key===key?view.places:(initial?.places??retainedPlacesWithinBounds(view.places,options?.bounds));
}

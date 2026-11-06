import {useEffect,useState} from 'react';
import {fuelApi} from '../services/fuelApi';
import type {PlacePhoto} from '../types/placePhoto';

const cache=new Map<string,{photo:PlacePhoto|null;until:number}>();
export function useExplorePhotos(places:readonly {id:string}[],enabled:boolean){
  const ids=places.map(place=>place.id),key=JSON.stringify(ids);
  const [photos,setPhotos]=useState<Record<string,PlacePhoto|null>>({});
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController(),now=Date.now();
    const ready:Record<string,PlacePhoto|null>={};
    const missing=ids.filter(id=>{
      const item=cache.get(id);
      if(item&&item.until>now){ready[id]=item.photo;return false;}return true;
    });
    setPhotos(current=>({...current,...ready}));
    void (async()=>{
      for(let offset=0;offset<missing.length;offset+=20){
        try{
          const result=await fuelApi<{photos:Record<string,PlacePhoto|null>}>('/places/photos',{
            method:'POST',body:JSON.stringify({ids:missing.slice(offset,offset+20)}),signal:controller.signal});
          if(controller.signal.aborted)return;
          for(const [id,photo] of Object.entries(result.photos||{}))cache.set(id,{photo,until:Date.now()+3600000});
          while(cache.size>500)cache.delete(cache.keys().next().value!);
          setPhotos(current=>({...current,...result.photos}));
        }catch{if(controller.signal.aborted)return;}
      }
    })();
    return()=>controller.abort();
    // The stable ID list prevents requests on GPS readings or unrelated renders.
  },[key,enabled]);
  return photos;
}

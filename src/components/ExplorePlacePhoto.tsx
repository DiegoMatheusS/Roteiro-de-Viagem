import {useState} from 'react';
import {TouristCategoryIcon} from './TouristCategoryIcon';
import type {ExplorePlace} from '../types/explore';

export function ExplorePlacePhoto({place}:{place:ExplorePlace}){
  const [failedSrc,setFailedSrc]=useState<string>();
  const available=Boolean(place.photo&&place.photo!==failedSrc);
  return <div className="rdv-explore-route-photo" aria-label={available?`Fotografia de ${place.name}`:'Local sem fotografia disponível'}>
    <TouristCategoryIcon kind={place.kind} name={place.name} size={32}/>
    {available?<img src={place.photo} alt={`Fotografia de ${place.name}`}
      loading="lazy" decoding="async" width={200} height={200} referrerPolicy="no-referrer"
      onError={()=>setFailedSrc(place.photo)}/>:<span className="rdv-explore-no-photo">Foto indisponível</span>}
  </div>;
}

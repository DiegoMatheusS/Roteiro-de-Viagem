import {useState} from 'react';
import {TouristCategoryIcon} from './TouristCategoryIcon';
import type {ExplorePlace} from '../types/explore';

export function ExplorePlacePhoto({place}:{place:ExplorePlace}){
  const [failedSrc,setFailedSrc]=useState<string>();
  // The catalogs used a non-image Wikimedia host. Commons thumbnails are served by upload.wikimedia.org.
  const photoSrc=place.photo?.replace(/^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\//,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/');
  const available=Boolean(photoSrc&&photoSrc!==failedSrc);
  return <div className="rdv-explore-route-photo" aria-label={available?`Fotografia de ${place.name}`:'Local sem fotografia disponível'}>
    <TouristCategoryIcon kind={place.kind} name={place.name} size={32}/>
    {available?<img src={photoSrc} alt={`Fotografia de ${place.name}`}
      loading="lazy" decoding="async" width={200} height={200} referrerPolicy="no-referrer"
      onError={()=>setFailedSrc(photoSrc)}/>:<span className="rdv-explore-no-photo">Foto indisponível</span>}
  </div>;
}

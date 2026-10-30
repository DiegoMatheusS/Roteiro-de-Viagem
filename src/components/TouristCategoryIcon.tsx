import {BedDouble,Building2,Coffee,Drama,Droplets,FerrisWheel,Flag,Footprints,
  Landmark,MapPin,Mountain,Route,ShoppingBag,Trees,UtensilsCrossed,Waves} from 'lucide-react';
import type {Place} from '../types/admin';
import {placeIconKind} from '../services/placeIconKind';

/** Match list pictograms to the category pins on both map engines. */
export function TouristCategoryIcon({kind,name='',size=23}:{kind:string;name?:string;size?:number}){
  const iconKind=placeIconKind(kind as Place['kind'],name);
  const Icon=iconKind==='park'||iconKind==='nature_reserve'?Trees:
    iconKind==='square'?FerrisWheel:
    iconKind==='theatre'?Drama:
    iconKind==='museum'||iconKind==='historic'||iconKind==='landmark'?Landmark:
    iconKind==='waterfall'?Droplets:
    iconKind==='beach'?Waves:
    iconKind==='viewpoint'?Mountain:
    iconKind==='trail'?Footprints:
    iconKind==='scenic_road'?Route:
    iconKind==='hotel'||iconKind==='inn'?BedDouble:
    iconKind==='restaurant'?UtensilsCrossed:
    iconKind==='cafe'?Coffee:
    iconKind==='shopping'||iconKind==='supermarket'?ShoppingBag:
    iconKind==='other'?Building2:
    kind==='racetrack'?Flag:
    kind==='city'?Building2:
    iconKind==='attraction'?MapPin:MapPin;
  return <Icon size={size} strokeWidth={1.9} aria-hidden="true"/>;
}

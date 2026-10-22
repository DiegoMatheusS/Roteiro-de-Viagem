import {offlineRegionReady,type OfflineRegion} from './offlineMapRegions';
export const OFFLINE_REGION_CHOICE_KEY='role:offline-map-selected:v1';
export const OFFLINE_REGIONS_CHANGED='role-offline-regions-changed';

export function readSelectedOfflineRegionId():string|null{
  try{
    const value=window.localStorage.getItem(OFFLINE_REGION_CHOICE_KEY);
    return value&&/^[a-zA-Z0-9_-]{1,80}$/.test(value)?value:null;
  }catch{return null;}
}
export function writeSelectedOfflineRegionId(id:string|null):void {
  try{
    if(id)window.localStorage.setItem(OFFLINE_REGION_CHOICE_KEY,id);
    else window.localStorage.removeItem(OFFLINE_REGION_CHOICE_KEY);
  }catch{/* Restricted storage must not prevent ordinary online maps. */}
}
export function usableOfflineRegion(regions:readonly OfflineRegion[],id:string|null):OfflineRegion|null{
  return id?regions.find(r=>r.id===id&&r.offlinePermissionConfirmed&&offlineRegionReady(r))??null:null;
}
export function offlineRegionContains(region:OfflineRegion,coords:[number,number]):boolean {
  const [lat,lon]=coords;
  return Number.isFinite(lat)&&Number.isFinite(lon)&&
    lat>=region.bounds.south&&lat<=region.bounds.north&&
    lon>=region.bounds.west&&lon<=region.bounds.east;
}

import type {RoleVectorMarker} from './vectorPlaceData';

export type Coordinates=[number,number];
export interface PoiVisibilityContext {
  zoom:number;
  navigationMode:boolean;
  /** Route planning keeps route-scoped fuel and toll pins tappable in overview. */
  showRouteServices?:boolean;
  location?:Coordinates;
  accuracyMeters?:number;
}
const TOURIST=new Set(['waterfall','viewpoint','park','museum','theatre','scenic_road',
  'landmark','historic','beach','trail','nature_reserve','attraction']);

export function poiCategory(marker:RoleVectorMarker):string {
  return marker.kind==='place'?marker.category:marker.kind;
}
export function poiAccent(category:string):string {
  if(category==='fuel')return '#2563eb';
  if(category==='toll')return '#b7791f';
  if(category==='restaurant'||category==='cafe')return '#ea580c';
  if(category==='hotel'||category==='inn')return '#7c3aed';
  if(category==='shopping'||category==='supermarket')return '#db2777';
  if(TOURIST.has(category))return '#15803d';
  return '#0369a1';
}
/** Icons vanish at lower zooms, tourist landmarks remain visible longer. */
export function poiVisibleAtZoom(marker:RoleVectorMarker,zoom:number):boolean {
  if(!Number.isFinite(zoom))return false;
  const category=poiCategory(marker);
  if(TOURIST.has(category))return zoom>=11;
  if(category==='toll')return zoom>=13;
  if(marker.kind==='place')return zoom>=14;
  return zoom>=15;
}
/** No guessed map point / price. Distances are calculated from real GPS and POI coordinates. */
export function poiDistanceMeters(a:Coordinates,b:Coordinates):number {
  const toRad=Math.PI/180;
  const dLat=(b[0]-a[0])*toRad,dLon=(b[1]-a[1])*toRad;
  const s=Math.sin(dLat/2)**2 + Math.cos(a[0]*toRad)*Math.cos(b[0]*toRad)*Math.sin(dLon/2)**2;
  return 12742000*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));
}
/** Expand no more than one trustworthy nearby marker; do not react to a noisy GPS fix. */
export function nearestPoiToExpand(
  markers:readonly RoleVectorMarker[], context:PoiVisibilityContext
):string|null {
  const {location,accuracyMeters,zoom,navigationMode}=context;
  if(!navigationMode||!location||!Number.isFinite(accuracyMeters)||accuracyMeters!>50||zoom<15
      ||!Number.isFinite(location[0])||!Number.isFinite(location[1]))return null;
  let closest:string|null=null,best=150;
  for(const marker of markers){
    if(!poiVisibleAtZoom(marker,zoom))continue;
    const distance=poiDistanceMeters(location,marker.coords);
    if(distance<best){best=distance;closest=marker.kind+':'+marker.id;}
  }
  return closest;
}

/** Nearby cards are previews, not persistent driving overlays. One POI is
 * shown for six seconds per approach. It may reappear only after leaving the
 * proximity area (or after returning to a suitable zoom). */
export const POI_AUTO_PREVIEW_MS=6000;
export interface PoiPreviewState { nearbyKey:string|null; sinceMs:number }
export const EMPTY_POI_PREVIEW: PoiPreviewState={nearbyKey:null,sinceMs:0};

export function resolvePoiPreview(
  previous:PoiPreviewState,nearbyKey:string|null,nowMs:number
):{state:PoiPreviewState;expandedKey:string|null;remainingMs:number|null}{
  if(!nearbyKey||!Number.isFinite(nowMs))
    return {state:EMPTY_POI_PREVIEW,expandedKey:null,remainingMs:null};
  const state=previous.nearbyKey===nearbyKey
    ?previous:{nearbyKey,sinceMs:nowMs};
  const elapsed=Math.max(0,nowMs-state.sinceMs);
  const remaining=Math.max(0,POI_AUTO_PREVIEW_MS-elapsed);
  return {state,expandedKey:remaining>0?nearbyKey:null,remainingMs:remaining>0?remaining:null};
}

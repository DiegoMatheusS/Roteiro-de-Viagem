import type { RoadAlert, RoadAlertType } from '../types/roadAlerts';
import { ROAD_ALERT_TYPES } from '../types/roadAlerts';
import {ROAD_ALERT_ART_URL,ROAD_ALERT_ARTWORK,roadAlertClip,POTHOLE_PATHS} from './roadAlertArtwork';

const knownKinds = new Set<string>(ROAD_ALERT_TYPES.map(type => type.id));

export function selectVisibleRoadAlerts(
  alerts: readonly RoadAlert[], now = Date.now()
): RoadAlert[] {
  const seen = new Set<string>();
  return alerts.filter(alert => {
    if (!alert || !alert.id || seen.has(alert.id)) return false;
    if (!knownKinds.has(alert.kind)) return false;
    if (alert.status && alert.status !== 'approved') return false;
    if (!Number.isFinite(alert.lat) || Math.abs(alert.lat) > 90 ||
        !Number.isFinite(alert.lng) || Math.abs(alert.lng) > 180) return false;
    const expiry = Date.parse(alert.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return false;
    seen.add(alert.id);
    return true;
  });
}

export type RoadAlertMarkerChange = 'create'|'replace'|'move'|'keep';

/** Render changes depend on kind/coordinates, not on notes or timestamps.
 * The selected alert object is refreshed separately even when the pin stays.
 */
export function roadAlertMarkerChange(
  previous: Pick<RoadAlert,'kind'|'lat'|'lng'>|null,
  next: Pick<RoadAlert,'kind'|'lat'|'lng'>
):RoadAlertMarkerChange {
  if(!previous)return 'create';
  if(previous.kind!==next.kind)return 'replace';
  if(previous.lat!==next.lat || previous.lng!==next.lng)return 'move';
  return 'keep';
}

let nextClipId=0;
export function createRoadAlertIconElement(kind: RoadAlertType): HTMLDivElement {
  const root=document.createElement('div');
  root.className='rdv-alert-pin';
  root.setAttribute('aria-hidden','true');
  root.style.cssText='width:38px;height:38px;display:grid;place-items:center;background:#fff;color:#9a3412;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 3px 10px #0f172a35;';
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('width','34');svg.setAttribute('height','34');
  if(kind==='pothole'){
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');
    svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
    for(const d of POTHOLE_PATHS){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);}
  }else{
    const artwork=ROAD_ALERT_ARTWORK[kind];
    svg.setAttribute('viewBox',artwork.viewBox);svg.dataset.roadAlertArt=kind;
    const img=document.createElementNS(ns,'image');
    img.setAttribute('href',ROAD_ALERT_ART_URL);img.setAttribute('width','1536');img.setAttribute('height','1024');
    {
      const id=`road-alert-map-${++nextClipId}`,defs=document.createElementNS(ns,'defs');
      const clip=document.createElementNS(ns,'clipPath'),polygon=document.createElementNS(ns,'polygon');
      clip.id=id;polygon.setAttribute('points',roadAlertClip(artwork));clip.append(polygon);defs.append(clip);svg.append(defs);
      img.setAttribute('clip-path',`url(#${id})`);
    }
    svg.append(img);
  }
  root.append(svg);return root;
}

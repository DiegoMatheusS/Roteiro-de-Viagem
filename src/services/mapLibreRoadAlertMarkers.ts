import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { RoadAlert } from '../types/roadAlerts';
import { ROAD_ALERT_TYPES } from '../types/roadAlerts';
import { createRoadAlertIconElement } from './mapRoadAlerts';

export function addRoleMaplibreRoadAlerts(
  map: MapLibreMap,
  alerts: readonly RoadAlert[],
  onSelect: (alert: RoadAlert) => void
): () => void {
  const markers: Marker[] = [];
  try {
    for (const alert of alerts) {
      const label = ROAD_ALERT_TYPES.find(type=>type.id===alert.kind)?.label || 'Ocorrência';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'road-alert-marker rdv-maplibre-road-alert';
      button.setAttribute('aria-label',`${label}. Confirmar se ainda está no local`);
      button.title = label;
      button.style.cssText = 'display:block;padding:0;background:transparent;border:0;cursor:pointer;';
      button.append(createRoadAlertIconElement(alert.kind));
      // Do not start a map click/navigation action when tapping a report.
      for (const type of ['click','dblclick','mousedown','touchstart'] as const) {
        button.addEventListener(type,event => event.stopPropagation(),{passive:true});
      }
      button.addEventListener('click', event => {
        event.stopPropagation();
        onSelect(alert);
      });
      const marker = new Marker({ element:button, anchor:'center' })
        .setLngLat([alert.lng,alert.lat]).addTo(map);
      markers.push(marker);
    }
  } catch (error) {
    for (const marker of markers) marker.remove();
    throw error;
  }
  return () => { for (const marker of markers) marker.remove(); };
}

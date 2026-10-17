import type { RoadAlert, RoadAlertType } from '../types/roadAlerts';
import { ROAD_ALERT_TYPES } from '../types/roadAlerts';

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

// Lucide-like vector pictograms. These paths are constants; never interpolated
// from community notes, place names or other untrusted content.
const iconPaths: Record<RoadAlertType, string> = {
  pothole: '<path d="m3 15 5-5 4 3 4-6 5 8-5 5H8l-5-5Z"/><path d="M7 16h.01M15 15h.01"/>',
  broken_vehicle: '<path d="M5 17H3v-6l2-5h14l2 5v6h-2M5 17h14M5 17v2h3v-2m8 0v2h3v-2M3 11h18M8 14h.01M16 14h.01"/>',
  speed_camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3"/><path d="m7 7 1-3h8l1 3"/>',
  road_obstruction: '<path d="M3 21 10 3h4l7 18H3Z"/><path d="M7 13h10M5 18h14"/>',
  flooded_road: '<path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 22c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="m12 3-4 7a4 4 0 0 0 8 0l-4-7Z"/>',
  police_presence: '<path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6l8-4Z"/><path d="m12 7 1.5 3 3.5.5-2.5 2.5.6 3.5L12 15l-3.1 1.5.6-3.5L7 10.5l3.5-.5L12 7Z"/>',
  robbery: '<path d="M5 8 12 3l7 5v9l-7 4-7-4V8Z"/><path d="M12 7v6M12 17h.01"/>'
};

export function createRoadAlertIconElement(kind: RoadAlertType): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'rdv-alert-pin';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'width:38px;height:38px;display:grid;place-items:center;background:#fff7ed;color:#9a3412;border:2px solid #c2410c;border-radius:12px;box-shadow:0 3px 10px #0f172a35;';
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','22');
  svg.setAttribute('height','22');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.8');
  svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  svg.innerHTML = iconPaths[kind];
  root.append(svg);
  return root;
}

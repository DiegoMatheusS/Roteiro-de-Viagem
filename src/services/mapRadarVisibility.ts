import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RoadAlert } from '../types/roadAlerts';
import { distanceBetweenKm } from './gpsTracking';
import { distanceToWay, isHighwayRoad } from './roadSpeedLimit';

export const RADAR_MIN_ZOOM = 12;
type Coordinates = [number, number];
type RoadMap = Pick<MapLibreMap, 'getStyle' | 'project' | 'queryRenderedFeatures'>;

function validPosition(position: Coordinates | undefined): position is Coordinates {
  return !!position && position.every(Number.isFinite) &&
    Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180;
}

export function radarAlertsInView(
  alerts: readonly RoadAlert[], position: Coordinates | undefined, zoom: number, highway: boolean
): RoadAlert[] {
  const showRadars = Number.isFinite(zoom) && zoom >= RADAR_MIN_ZOOM && validPosition(position);
  const radiusKm = highway ? 8 : 3;
  return alerts.filter(alert => alert.kind !== 'speed_camera' ||
    (showRadars && distanceBetweenKm(position, [alert.lat, alert.lng]) <= radiusKm));
}

/** Use the roads already rendered around the live GPS fix. At an interchange
 * or parallel street, extend the radius only when the highway is clearly closer. */
export function mapPositionIsOnHighway(
  map: RoadMap | null, position: Coordinates | undefined, accuracy?: number
): boolean {
  if (!map || !validPosition(position) || (accuracy !== undefined && !(accuracy >= 0 && accuracy <= 25))) {
    return false;
  }
  const layers = map.getStyle()?.layers?.filter(layer => layer.type === 'line' &&
    ('source-layer' in layer && layer['source-layer'] === 'transportation' ||
      /^(highway|bridge|tunnel)[_-]/.test(layer.id))) ?? [];
  if (!layers.length) return false;
  const point = map.project([position[1], position[0]]);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const size = 16;
  const features = map.queryRenderedFeatures(
    [[point.x - size, point.y - size], [point.x + size, point.y + size]],
    { layers: layers.map(layer => layer.id) }
  );
  let highway = Infinity, localRoad = Infinity;
  for (const feature of features) {
    const tags = feature.properties;
    const roadClass = tags?.class ?? tags?.highway;
    if (typeof roadClass !== 'string' || /^(path|track|rail|transit|ferry)/.test(roadClass)) continue;
    const geometry = feature.geometry;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] :
      geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    const isHighway = isHighwayRoad({ highway: roadClass, ref: tags?.ref });
    for (const line of lines) {
      const distance = distanceToWay(position, { geometry: line.map(([lon, lat]) => ({ lon, lat })) });
      if (isHighway) highway = Math.min(highway, distance);
      else localRoad = Math.min(localRoad, distance);
    }
  }
  return highway <= Math.min(22, 10 + (accuracy ?? 12)) && highway + 6 < localRoad;
}

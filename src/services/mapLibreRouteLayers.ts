import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { splitRouteAtPosition } from './routeProgress';

type Coordinates = [number, number]; // latitude, longitude (Leaflet/OSRM contract)
type Role = 'alternative' | 'active' | 'remaining' | 'travelled';

export interface RoleRouteFeature {
  type: 'Feature';
  properties: { role: Role; color: string };
  geometry: { type: 'LineString'; coordinates: Coordinates[] }; // GeoJSON: longitude, latitude
}
export interface RoleRouteCollection {
  type: 'FeatureCollection';
  features: RoleRouteFeature[];
}
export interface RoleRouteOptions {
  routePath: Coordinates[];
  alternatives: { id: string; routePath: Coordinates[] }[];
  selectedRouteId?: string;
  modalityColor: string;
  userLocation?: Coordinates;
  travelledDistanceKm: number;
  totalRouteKm: number;
  navigationMode: boolean;
  blueRoute: boolean;
}

const SOURCE = 'role-verified-routes';
const layers = [
  'role-alternative-outline', 'role-alternative-line', 'role-active-outline',
  'role-active-glow', 'role-active-line', 'role-remaining-line', 'role-travelled-line'
] as const;

function verified(points: Coordinates[]): boolean {
  return points.length >= 2 && points.every(point => Array.isArray(point) && point.length === 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180);
}

function feature(points: Coordinates[], role: Role, color: string): RoleRouteFeature {
  return {
    type: 'Feature',
    properties: { role, color },
    geometry: {
      type: 'LineString',
      coordinates: points.map(([lat,lon]): Coordinates => [lon,lat])
    }
  };
}

/** Only verified road geometries; never interpolate a straight-line replacement. */
export function buildRoleRouteCollection(options: RoleRouteOptions): RoleRouteCollection {
  const features: RoleRouteFeature[] = [];
  if (!options.navigationMode && options.alternatives.length > 1) {
    for (const option of options.alternatives) {
      if (option.id !== options.selectedRouteId && verified(option.routePath))
        features.push(feature(option.routePath, 'alternative', '#64748b'));
    }
  }
  if (!verified(options.routePath)) return { type:'FeatureCollection', features };
  features.push(feature(options.routePath, 'active', options.modalityColor));

  if (options.navigationMode || options.blueRoute) {
    const progress = splitRouteAtPosition(
      options.routePath, options.userLocation,
      options.travelledDistanceKm, options.totalRouteKm
    );
    if (verified(progress.remaining)) features.push(feature(progress.remaining, 'remaining', '#67c7ff'));
    if (verified(progress.travelled)) features.push(feature(progress.travelled, 'travelled', '#17479b'));
  }
  return { type: 'FeatureCollection', features };
}

/**
 * MapLibre owns line rendering. Leaflet keeps only transparent hit areas for
 * alternative-route selection, and DOM markers remain in the Leaflet panes.
 */
export function updateRoleVectorRoutes(gl: MapLibreMap, options: RoleRouteOptions): void {
  if (!gl.isStyleLoaded()) return;
  const data = buildRoleRouteCollection(options);
  const existing = gl.getSource(SOURCE) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    gl.addSource(SOURCE, { type:'geojson', data, tolerance:0.35 });
  }

  const addLine = (id: string, role: Role, color: string | ['get', 'color'],
    width: number, opacity: number): void => {
    if (gl.getLayer(id)) return;
    gl.addLayer({
      id, type:'line', source:SOURCE,
      filter:['==',['get','role'],role],
      layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':color,'line-width':width,'line-opacity':opacity}
    });
  };
  addLine(layers[0], 'alternative', '#ffffff', 9, 0.86);
  addLine(layers[1], 'alternative', '#64748b', 5, 0.78);
  addLine(layers[2], 'active', '#ffffff', 10, 0.96);
  if (!(options.navigationMode || options.blueRoute)) {
    addLine(layers[3], 'active', ['get','color'], 7, 0.6);
    addLine(layers[4], 'active', ['get','color'], 5, 1);
  } else {
    // Styles persist across GPS updates, so remove the inactive preview lines.
    for (const id of [layers[3],layers[4]]) if (gl.getLayer(id)) gl.removeLayer(id);
  }
  addLine(layers[5], 'remaining', '#67c7ff', 7, 1);
  addLine(layers[6], 'travelled', '#17479b', 7, 1);
}

export function clearRoleVectorRoutes(gl: MapLibreMap): void {
  if (!gl.isStyleLoaded()) return;
  for (const id of [...layers].reverse()) if (gl.getLayer(id)) gl.removeLayer(id);
  if (gl.getSource(SOURCE)) gl.removeSource(SOURCE);
}

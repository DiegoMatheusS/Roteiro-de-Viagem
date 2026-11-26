import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { routeZoomStroke } from './mapLibreRouteLayers';
import { POLICE_ROUTE_BLUE, POLICE_ROUTE_RED, type PoliceRoute } from '../types/policeRoute';

const SOURCE = 'role-police-route';
const LAYERS = ['role-police-route-blue', 'role-police-route-red', 'role-police-station'];
const POLICE_LINE_OFFSET = routeZoomStroke(8, 11, 16);
const renderedRoutes = new WeakMap<MapLibreMap, PoliceRoute>();

export function updatePoliceRoute(map: MapLibreMap, route?: PoliceRoute) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!route) {
    if (source) {
      for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      map.removeSource(SOURCE);
    }
    renderedRoutes.delete(map);
    return;
  }
  if (source && renderedRoutes.get(map) === route) return;
  const [lat, lng] = route.station.coords;
  const data: FeatureCollection<LineString | Point> = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: {
        type: 'LineString', coordinates: route.routePath.map(([lat, lng]) => [lng, lat])
      } },
      { type: 'Feature', properties: { name: route.station.name }, geometry: {
        type: 'Point', coordinates: [lng, lat]
      } }
    ]
  };
  if (source) source.setData(data);
  else {
    map.addSource(SOURCE, { type: 'geojson', data });
    const before = map.getLayer('role-active-outline') ? 'role-active-outline' : undefined;
    map.addLayer({
      id: LAYERS[0], type: 'line', source: SOURCE, filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': POLICE_ROUTE_BLUE, 'line-width': routeZoomStroke(4, 6, 8), 'line-offset': POLICE_LINE_OFFSET }
    }, before);
    map.addLayer({
      id: LAYERS[1], type: 'line', source: SOURCE, filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': POLICE_ROUTE_RED, 'line-width': routeZoomStroke(2, 3, 4),
        'line-dasharray': [2, 2], 'line-offset': POLICE_LINE_OFFSET }
    }, before);
    map.addLayer({
      id: LAYERS[2], type: 'circle', source: SOURCE, filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': POLICE_ROUTE_RED, 'circle-radius': 7,
        'circle-stroke-width': 3, 'circle-stroke-color': POLICE_ROUTE_BLUE }
    });
  }
  renderedRoutes.set(map, route);
}

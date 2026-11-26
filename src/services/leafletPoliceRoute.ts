import L from 'leaflet';
import { POLICE_ROUTE_BLUE, POLICE_ROUTE_RED, type PoliceRoute } from '../types/policeRoute';

function offsetRoute(map: L.Map, route: PoliceRoute, offset: number): L.LatLng[] {
  const projected = route.routePath.map(point => map.project(point));
  const points = projected.filter((point, index) => index === 0 || !point.equals(projected[index - 1]));
  const normals = points.slice(1).map((point, index) => {
    const delta = point.subtract(points[index]);
    const length = Math.hypot(delta.x, delta.y);
    return L.point(-delta.y / length, delta.x / length);
  });
  return points.map((point, index) => {
    const before = normals[index - 1] ?? normals[index];
    const after = normals[index] ?? before;
    if (!before || !after) return map.unproject(point);
    const alignment = before.x * after.x + before.y * after.y;
    const normal = alignment < -0.75 ? after : before.add(after).divideBy(1 + alignment);
    return map.unproject(point.add(normal.multiplyBy(offset)));
  });
}

export function addLeafletPoliceRoute(map: L.Map, route: PoliceRoute) {
  const paneName = 'police-route';
  const pane = map.getPane(paneName) ?? map.createPane(paneName);
  pane.style.zIndex = '390';
  pane.style.pointerEvents = 'none';
  const blue = L.polyline([], { pane: paneName, color: POLICE_ROUTE_BLUE,
    weight: 8, interactive: false, className: 'rdv-police-route-blue' });
  const red = L.polyline([], { pane: paneName, color: POLICE_ROUTE_RED,
    weight: 4, dashArray: '8 8', lineCap: 'butt', interactive: false, className: 'rdv-police-route-red' });
  const redraw = () => {
    const points = offsetRoute(map, route, 16);
    blue.setLatLngs(points);
    red.setLatLngs(points);
  };
  redraw();
  const group = L.layerGroup([blue, red,
    L.circleMarker(route.station.coords, { pane: paneName, radius: 7, color: POLICE_ROUTE_BLUE,
      weight: 3, fillColor: POLICE_ROUTE_RED, fillOpacity: 1, interactive: false })
  ]).addTo(map);
  map.on('zoomend', redraw);
  return () => { map.off('zoomend', redraw); group.remove(); };
}

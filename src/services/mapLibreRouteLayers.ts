import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { projectRouteProgress,routeProgressRenderKey,type RouteProjection } from './routeProgress';
import {routeEditPoint,type EditPoint} from './mapRouteEditPoint';

type Coordinates = [number, number]; // latitude, longitude (Leaflet/OSRM contract)
type Role = 'alternative' | 'active' | 'remaining' | 'travelled';

export interface RoleRouteFeature {
  type: 'Feature';
  properties: { role: Role; color: string; routeId?: string };
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

/** Zoom-responsive strokes keep a long route readable in overview without
 * hiding road names. MapLibre evaluates this paint expression on zoom itself:
 * no JS zoom listener and no repeated GeoJSON uploads or invented geometry. */
export type RouteZoomStroke=['interpolate',['linear'],['zoom'],number,number,number,number,number,number];
export function routeZoomStroke(overview:number,city:number,street:number):RouteZoomStroke {
  return ['interpolate',['linear'],['zoom'],5,overview,11,city,16,street];
}

// Long itineraries must not be serialized and resent to MapLibre's worker for
// every GPS tick, weather update or convoy movement. Compare the real OSRM
// progress vertex (not a rounded/drawn synthetic geometry) and stable inputs.
interface RouteRenderSnapshot {
  routePath:Coordinates[];
  alternatives:RoleRouteOptions['alternatives'];
  selectedRouteId?:string;
  modalityColor:string;
  navigationMode:boolean;
  blueRoute:boolean;
  progressKey:string|null;
  featureCount:number;
}
const lastRender=new WeakMap<MapLibreMap,RouteRenderSnapshot>();
function sameRouteOptions(a:RoleRouteOptions['alternatives'],b:RoleRouteOptions['alternatives']){
  return a.length===b.length && a.every((route,i)=>
    route.id===b[i].id && route.routePath===b[i].routePath);
}

const layers = [
  'role-alternative-outline', 'role-alternative-line', 'role-active-outline',
  'role-active-glow', 'role-active-line', 'role-remaining-line', 'role-travelled-line'
] as const;

function verified(points: Coordinates[]): boolean {
  return points.length >= 2 && points.every(point => Array.isArray(point) && point.length === 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180);
}

function lineFeature(coordinates: Coordinates[], role: Role, color: string, routeId?: string): RoleRouteFeature {
  return {
    type: 'Feature',
    properties: { role, color, ...(routeId ? { routeId } : {}) },
    geometry: { type: 'LineString', coordinates }
  };
}

/** GeoJSON (lon,lat) copy of a verified road path, built once per path.
 * Navigation rebuilds the collection on progress changes; re-validating and
 * re-mapping tens of thousands of vertices each time made every update cost
 * tens of milliseconds on the main thread. Paths are replaced, never edited in
 * place; the length and end-point guard rebuilds the copy if one ever is. */
interface LngLatPath { length: number; first: number|undefined; last: number|undefined;
  valid: boolean; coordinates: Coordinates[] }
const lngLatPaths = new WeakMap<Coordinates[], LngLatPath>();
function lngLatPath(points: Coordinates[]): LngLatPath {
  const length = points.length;
  const first = points[0]?.[0], last = points[length - 1]?.[0];
  const cached = lngLatPaths.get(points);
  if (cached && cached.length === length && cached.first === first && cached.last === last) return cached;
  const isValid = verified(points);
  const entry: LngLatPath = { length, first, last, valid: isValid,
    coordinates: isValid ? points.map(([lat,lon]): Coordinates => [lon,lat]) : [] };
  lngLatPaths.set(points, entry);
  return entry;
}

/** Same split as splitRouteAtPosition, applied to the cached GeoJSON path so
 * progress updates slice pointers instead of re-mapping every vertex. */
function splitLngLat(full: Coordinates[], position: RouteProjection | null):
  { travelled: Coordinates[]; remaining: Coordinates[] } {
  if (!position) return { travelled: [], remaining: full.slice() };
  const { segmentStart, fraction, projected } = position;
  if (fraction <= 1e-8) {
    return { travelled: full.slice(0, segmentStart + 1), remaining: full.slice(segmentStart) };
  }
  if (fraction >= 1 - 1e-8) {
    return { travelled: full.slice(0, segmentStart + 2), remaining: full.slice(segmentStart + 1) };
  }
  // This coordinate lies on a verified OSRM segment, never on an invented road.
  const point: Coordinates = [projected[1], projected[0]];
  return { travelled: [...full.slice(0, segmentStart + 1), point],
    remaining: [point, ...full.slice(segmentStart + 1)] };
}

/** Only verified road geometries; never interpolate a straight-line replacement. */
export function buildRoleRouteCollection(options: RoleRouteOptions): RoleRouteCollection {
  const features: RoleRouteFeature[] = [];
  if (!options.navigationMode && options.alternatives.length > 1) {
    for (const option of options.alternatives) {
      if (!option.id || option.id === options.selectedRouteId) continue;
      const path = lngLatPath(option.routePath);
      if (path.valid) features.push(lineFeature(path.coordinates, 'alternative', '#64748b', option.id));
    }
  }
  const active = lngLatPath(options.routePath);
  if (!active.valid) return { type:'FeatureCollection', features };
  features.push(lineFeature(active.coordinates, 'active', options.modalityColor));

  if (options.navigationMode || options.blueRoute) {
    const position = projectRouteProgress(
      options.routePath, options.userLocation,
      options.travelledDistanceKm, options.totalRouteKm
    );
    const progress = splitLngLat(active.coordinates, position);
    if (progress.remaining.length >= 2) features.push(lineFeature(progress.remaining, 'remaining', '#67c7ff'));
    if (progress.travelled.length >= 2) features.push(lineFeature(progress.travelled, 'travelled', '#17479b'));
  }
  return { type: 'FeatureCollection', features };
}

/** Find a user-selected verified alternative in MapLibre's own rendered lines.
 * Leaflet still owns the viewport and forwards click coordinates; no second
 * interactive canvas and no invisible Leaflet route hit areas are needed.
 */
export function queryRoleVectorAlternative(
  gl: Pick<MapLibreMap,'isStyleLoaded'|'getLayer'|'project'|'queryRenderedFeatures'>,
  coordinates: Coordinates,
  validIds: ReadonlySet<string>,
  tolerancePx=12
): string | null {
  if (!gl.isStyleLoaded() || !gl.getLayer('role-alternative-line') ||
    !Array.isArray(coordinates) || coordinates.length!==2 ||
    !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
    Math.abs(coordinates[0])>90 || Math.abs(coordinates[1])>180 ||
    validIds.size===0) return null;
  const projected=gl.project([coordinates[1],coordinates[0]]);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y))return null;
  const tolerance=Number.isFinite(tolerancePx)?Math.max(4,Math.min(24,tolerancePx)):12;
  const results=gl.queryRenderedFeatures(
    [[projected.x-tolerance,projected.y-tolerance],
      [projected.x+tolerance,projected.y+tolerance]],
    {layers:['role-alternative-line']}
  );
  let selected:string|null=null;
  let nearest=tolerance*tolerance;
  for (const item of results) {
    const id=item.properties?.routeId;
    if(item.properties?.role!=='alternative' || typeof id!=='string' || !validIds.has(id))continue;
    const geometry=item.geometry;
    const lines=geometry?.type==='LineString'?[geometry.coordinates]
      :geometry?.type==='MultiLineString'?geometry.coordinates:[];
    for(const line of lines){
      let previous:{x:number;y:number}|null=null;
      for(const coordinate of line){
        if(coordinate.length<2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])){
          previous=null;continue;
        }
        const point=gl.project([coordinate[0],coordinate[1]]);
        if(!Number.isFinite(point.x)||!Number.isFinite(point.y)){previous=null;continue;}
        if(previous){
          const dx=point.x-previous.x,dy=point.y-previous.y;
          const length=dx*dx+dy*dy;
          const t=length?Math.max(0,Math.min(1,
            ((projected.x-previous.x)*dx+(projected.y-previous.y)*dy)/length)):0;
          const distance=(projected.x-previous.x-t*dx)**2+(projected.y-previous.y-t*dy)**2;
          // Keep renderer order only for an exact tie (e.g. shared road segments).
          if(distance<nearest || (selected===null && distance===nearest)){
            nearest=distance;selected=id;
          }
        }
        previous=point;
      }
    }
  }
  return selected;
}

/** Hit-test only rendered active-route segments; no full-journey projection
 * or waypoint is created until the user actually taps the route line. */
export function queryRoleRouteEditPoint(
  gl:Pick<MapLibreMap,'getLayer'|'project'|'queryRenderedFeatures'>,
  coordinates:Coordinates,tolerancePx=14
):EditPoint|null{
  const ids=['role-active-outline','role-active-line','role-remaining-line','role-travelled-line']
    .filter(id=>Boolean(gl.getLayer(id)));
  if(!ids.length)return null;
  const tap=gl.project([coordinates[1],coordinates[0]]);
  const features=gl.queryRenderedFeatures([[tap.x-tolerancePx,tap.y-tolerancePx],
    [tap.x+tolerancePx,tap.y+tolerancePx]],{layers:ids});
  const paths:EditPoint[][]=[];
  for(const feature of features){
    if(!['active','remaining','travelled'].includes(feature.properties?.role))continue;
    const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:
      feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[];
    for(const line of lines)paths.push(line.map(([lon,lat]):EditPoint=>[lat,lon]));
  }
  return routeEditPoint(tap,paths,point=>gl.project([point[1],point[0]]),tolerancePx);
}

/** MapLibre owns all verified line rendering and precise route hit-testing.
 * Leaflet only forwards map gestures/clicks and provides full raster fallback.
 */
export function updateRoleVectorRoutes(gl: MapLibreMap, options: RoleRouteOptions): number {
  if (!gl.isStyleLoaded()) return 0;
  const existing = gl.getSource(SOURCE) as GeoJSONSource | undefined;
  const progressKey=(options.navigationMode||options.blueRoute)
    ?routeProgressRenderKey(options.routePath,options.userLocation,
      options.travelledDistanceKm,options.totalRouteKm):null;
  const old=lastRender.get(gl);
  if(existing && old && gl.getLayer(layers[2]) &&
    old.routePath===options.routePath && old.selectedRouteId===options.selectedRouteId &&
    old.modalityColor===options.modalityColor &&
    old.navigationMode===options.navigationMode && old.blueRoute===options.blueRoute &&
    old.progressKey===progressKey &&
    sameRouteOptions(old.alternatives,options.alternatives)){
    return old.featureCount;
  }
  const data = buildRoleRouteCollection(options);
  if (existing) {
    existing.setData(data);
  } else {
    gl.addSource(SOURCE, { type:'geojson', data, tolerance:0.35 });
  }

  const addLine = (id: string, role: Role, color: string | ['get', 'color'],
    width: number | RouteZoomStroke, opacity: number): void => {
    if (gl.getLayer(id)) return;
    gl.addLayer({
      id, type:'line', source:SOURCE,
      filter:['==',['get','role'],role],
      layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':color,'line-width':width,'line-opacity':opacity}
    });
  };
  addLine(layers[0], 'alternative', '#ffffff', routeZoomStroke(4,6,9), 0.86);
  addLine(layers[1], 'alternative', '#64748b', routeZoomStroke(2,4,5), 0.78);
  addLine(layers[2], 'active', '#ffffff', routeZoomStroke(5,7.5,10), 0.96);
  if (!(options.navigationMode || options.blueRoute)) {
    addLine(layers[3], 'active', ['get','color'], routeZoomStroke(3,5,7), 0.6);
    addLine(layers[4], 'active', ['get','color'], routeZoomStroke(2,4,5), 1);
  } else {
    // Styles persist across GPS updates, so remove the inactive preview lines.
    for (const id of [layers[3],layers[4]]) if (gl.getLayer(id)) gl.removeLayer(id);
  }
  addLine(layers[5], 'remaining', '#67c7ff', routeZoomStroke(3,5,7), 1);
  addLine(layers[6], 'travelled', '#17479b', routeZoomStroke(3,5,7), 1);
  lastRender.set(gl,{routePath:options.routePath,
    alternatives:options.alternatives.map(route=>({id:route.id,routePath:route.routePath})),
    selectedRouteId:options.selectedRouteId,modalityColor:options.modalityColor,
    navigationMode:options.navigationMode,blueRoute:options.blueRoute,
    progressKey,featureCount:data.features.length});
  // Report features successfully supplied to the vector source for UI diagnostics.
  return data.features.length;
}

export function clearRoleVectorRoutes(gl: MapLibreMap): void {
  lastRender.delete(gl);
  if (!gl.isStyleLoaded()) return;
  for (const id of [...layers].reverse()) if (gl.getLayer(id)) gl.removeLayer(id);
  if (gl.getSource(SOURCE)) gl.removeSource(SOURCE);
}

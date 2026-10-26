/** Decides when MapLibre may receive new route-progress geometry.
 *
 * Publishing progress serializes the whole road path and sends it to the map
 * worker. That is cheap on a short route and a visible stall on a long one, so
 * it must never compete with the user's own pan, pinch or wheel zoom. */

export const MIN_ROUTE_RENDER_GAP_MS=250;
export const MAX_ROUTE_RENDER_GAP_MS=1000;
/** One extra millisecond of spacing per this many route vertices. */
const VERTICES_PER_EXTRA_MS=25;

/** Minimum time between progress uploads during guidance: 250 ms for short
 * routes, up to one second for very long ones (>= 25,000 vertices). */
export function routeRenderGapMs(routeVertices:number):number{
  if(!Number.isFinite(routeVertices)||routeVertices<=0)return MIN_ROUTE_RENDER_GAP_MS;
  return Math.min(MAX_ROUTE_RENDER_GAP_MS,
    Math.max(MIN_ROUTE_RENDER_GAP_MS,Math.round(routeVertices/VERTICES_PER_EXTRA_MS)));
}

export interface RouteRenderInput{
  /** The itinerary itself (path, alternatives, mode) changed: always show it. */
  routeChanged:boolean;
  /** A finger is down, or the user took the camera and the map is still moving. */
  interacting:boolean;
  navigationMode:boolean;
  now:number;
  lastRenderAt:number;
  routeVertices:number;
}
/** render: update now. defer: update once the gesture settles. skip: too soon. */
export type RouteRenderDecision='render'|'defer'|'skip';

export function decideRouteRender(input:RouteRenderInput):RouteRenderDecision{
  if(input.routeChanged)return 'render';
  if(input.interacting)return 'defer';
  if(!input.navigationMode)return 'render';
  return input.now-input.lastRenderAt>=routeRenderGapMs(input.routeVertices)?'render':'skip';
}

const EMPTY_LIST:readonly unknown[]=Object.freeze([]);
/** React callers often pass `value||[]`, a fresh empty array on every render.
 * Comparing those by identity makes "nothing" look like a change on each GPS
 * fix and rebuilds every overlay. Collapse all empty lists to one instance. */
export function stableList<T>(list:readonly T[]|null|undefined):readonly T[]|undefined{
  if(list==null)return undefined;
  return list.length===0?EMPTY_LIST as readonly T[]:list;
}

/** Phones commonly report a device pixel ratio of 3 or more. Rendering the
 * navigation canvas at 3x draws 2.25x the pixels of a 2x canvas while panning
 * and zooming, which is where mid-range GPUs drop frames. */
export const NAVIGATION_MAX_PIXEL_RATIO=2;
export function mapPixelRatio(devicePixelRatio:number,navigationMode:boolean):number{
  const ratio=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
  return navigationMode?Math.min(ratio,NAVIGATION_MAX_PIXEL_RATIO):ratio;
}

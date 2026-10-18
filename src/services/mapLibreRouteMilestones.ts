import type {GeoJSONSource,Map as MapLibreMap} from 'maplibre-gl';
import {selectRouteMilestones,type RoutePoint} from './routeMilestones';

const SOURCE='role-route-milestones';
const LAYER='role-route-milestone-circles';

interface MilestoneFeature {
  type:'Feature';
  properties:Record<string,never>;
  geometry:{type:'Point';coordinates:[number,number]};
}
interface MilestoneData {type:'FeatureCollection';features:MilestoneFeature[]}

export function buildRoleMilestoneFeatures(routePath:readonly RoutePoint[]):MilestoneData {
  return {
    type:'FeatureCollection',
    features:selectRouteMilestones(routePath).map(([lat,lon])=>({
      type:'Feature',
      properties:{},
      geometry:{type:'Point',coordinates:[lon,lat]}
    }))
  };
}

/** Small route decorations in one native WebGL circle layer, not hundreds
 * of individually-positioned Leaflet marker elements. No click hit area.
 */
export function updateRoleVectorMilestones(
  gl:Pick<MapLibreMap,'isStyleLoaded'|'getSource'|'addSource'|'getLayer'|'addLayer'|'setPaintProperty'>,
  routePath:readonly RoutePoint[], color:string, visible:boolean
):number {
  if(!gl.isStyleLoaded())return 0;
  const data=buildRoleMilestoneFeatures(visible?routePath:[]);
  const existing=gl.getSource(SOURCE) as GeoJSONSource|undefined;
  if(existing)existing.setData(data);
  else gl.addSource(SOURCE,{type:'geojson',data});
  if(!gl.getLayer(LAYER)) {
    gl.addLayer({
      id:LAYER,
      source:SOURCE,
      type:'circle',
      paint:{
        'circle-color':'#ffffff',
        'circle-radius':3,
        'circle-stroke-color':color,
        'circle-stroke-width':2,
        'circle-opacity':0.92
      }
    });
  }else gl.setPaintProperty(LAYER,'circle-stroke-color',color);
  return data.features.length;
}
export function clearRoleVectorMilestones(gl:Pick<MapLibreMap,'isStyleLoaded'|'getLayer'|'removeLayer'|'getSource'|'removeSource'>):void {
  if(!gl.isStyleLoaded())return;
  if(gl.getLayer(LAYER))gl.removeLayer(LAYER);
  if(gl.getSource(SOURCE))gl.removeSource(SOURCE);
}

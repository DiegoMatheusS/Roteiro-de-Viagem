import type {GeoJSONSource,Map as MapLibreMap} from 'maplibre-gl';
import {selectRouteMilestones,type RoutePoint} from './routeMilestones';

const SOURCE='role-route-milestones';
const LAYER='role-route-milestone-circles';
// GPS updates must not reserialize identical decorative route points.
const lastMilestones=new WeakMap<object,{path:readonly RoutePoint[];visible:boolean;color:string;count:number}>();

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
  const existing=gl.getSource(SOURCE) as GeoJSONSource|undefined;
  const layerExists=Boolean(gl.getLayer(LAYER));
  const previous=lastMilestones.get(gl);
  // A style change removes sources/layers, so a cached snapshot is only
  // reusable when MapLibre still owns both resources.
  if(existing&&layerExists&&previous&&previous.path===routePath&&previous.visible===visible){
    if(previous.color!==color)gl.setPaintProperty(LAYER,'circle-stroke-color',color);
    lastMilestones.set(gl,{...previous,color});
    return previous.count;
  }
  const data=buildRoleMilestoneFeatures(visible?routePath:[]);
  if(existing)existing.setData(data);
  else gl.addSource(SOURCE,{type:'geojson',data});
  if(!layerExists) {
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
  }else if(previous?.color!==color)gl.setPaintProperty(LAYER,'circle-stroke-color',color);
  lastMilestones.set(gl,{path:routePath,visible,color,count:data.features.length});
  return data.features.length;
}
export function clearRoleVectorMilestones(gl:Pick<MapLibreMap,'isStyleLoaded'|'getLayer'|'removeLayer'|'getSource'|'removeSource'>):void {
  lastMilestones.delete(gl);
  if(!gl.isStyleLoaded())return;
  if(gl.getLayer(LAYER))gl.removeLayer(LAYER);
  if(gl.getSource(SOURCE))gl.removeSource(SOURCE);
}

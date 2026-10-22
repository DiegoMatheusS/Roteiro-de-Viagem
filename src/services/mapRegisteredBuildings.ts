import type {Feature,FeatureCollection,MultiPolygon,Polygon} from 'geojson';
import type {GeoJSONSource,Map as MapLibreMap} from 'maplibre-gl';
import {poiAccent,poiCategory} from './mapPoiPresentation';
import {validMarkerPosition,type RoleVectorMarker} from './vectorPlaceData';

export const REGISTERED_BUILDINGS_SOURCE='role-registered-building-footprints';
export const REGISTERED_BUILDINGS_FILL='role-registered-building-fill';
export const REGISTERED_BUILDINGS_OUTLINE='role-registered-building-outline';
export const REGISTERED_BUILDING_MIN_ZOOM=16;
type BuildingGeometry=Polygon|MultiPolygon;
type Highlight=Feature<BuildingGeometry,{color:string;placeId:string}>;
export type RegisteredBuildingCollection=FeatureCollection<BuildingGeometry,{color:string;placeId:string}>;

function ringContains(ring:number[][],lon:number,lat:number):boolean {
  let inside=false;
  if(ring.length<4)return false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if(!a||!b||a.length<2||b.length<2||
      !Number.isFinite(a[0])||!Number.isFinite(a[1])||
      !Number.isFinite(b[0])||!Number.isFinite(b[1]))return false;
    // Treat points directly on a wall as inside, including tile boundaries.
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const cross=(lon-a[0])*dy-(lat-a[1])*dx;
    if(Math.abs(cross)<1e-10 && lon>=Math.min(a[0],b[0])-1e-10 &&
      lon<=Math.max(a[0],b[0])+1e-10 && lat>=Math.min(a[1],b[1])-1e-10 &&
      lat<=Math.max(a[1],b[1])+1e-10)return true;
    if((a[1]>lat)!==(b[1]>lat) &&
      lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function buildingContainsLocation(geometry:BuildingGeometry,location:[number,number]):boolean {
  if(!validMarkerPosition(location))return false;
  const [lat,lon]=location;
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(rings=>rings.length>0 &&
    ringContains(rings[0],lon,lat) &&
    rings.slice(1).every(hole=>!ringContains(hole,lon,lat)));
}
function buildingGeometry(geometry:Feature['geometry']):BuildingGeometry|null{
  return geometry?.type==='Polygon'||geometry?.type==='MultiPolygon'?geometry:null;
}
function reasonableBuilding(geometry:BuildingGeometry):boolean {
  // Avoid sending invalid or unusually complex remote geometry to a GPU worker.
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let vertices=0;
  for(const rings of polygons)for(const ring of rings){
    vertices+=ring.length;
    if(vertices>1200)return false;
  }
  return vertices>=4;
}

/** Only genuine vector building polygons that contain a registered POI point.
 * No nearest-building estimates: an address on a street keeps only its pin.
 * Multiple distinct POIs inside the same structure are ambiguous; leave it uncolored.
 */
export function selectRegisteredBuildingFootprints(
  markers:readonly RoleVectorMarker[],
  lookup:(point:[number,number])=>readonly Feature[],
  zoom:number,
  visible:(location:[number,number])=>boolean
):RegisteredBuildingCollection {
  const result:RegisteredBuildingCollection={type:'FeatureCollection',features:[]};
  if(!Number.isFinite(zoom)||zoom<REGISTERED_BUILDING_MIN_ZOOM)return result;
  const chosen=new Map<string,Highlight|null>();
  let inspected=0;
  for(const marker of markers){
    if(marker.kind!=='place'||!validMarkerPosition(marker.coords)||!visible(marker.coords))continue;
    if(++inspected>32)break;
    let candidates:readonly Feature[];
    try{candidates=lookup(marker.coords);}catch{continue;}
    if(!Array.isArray(candidates))continue;
    for(const candidate of candidates.slice(0,12)){
      const geometry=buildingGeometry(candidate.geometry);
      if(!geometry||!reasonableBuilding(geometry)||!buildingContainsLocation(geometry,marker.coords))continue;
      const fingerprint=JSON.stringify(geometry.coordinates);
      const previous=chosen.get(fingerprint);
      if(previous!==undefined){
        if(previous&&previous.properties.placeId!==marker.id)chosen.set(fingerprint,null);
      }else{
        chosen.set(fingerprint,{
          type:'Feature',
          properties:{color:poiAccent(poiCategory(marker)),placeId:marker.id},
          geometry
        });
      }
      break;
    }
  }
  result.features=[...chosen.values()].filter((value):value is Highlight=>value!==null).slice(0,24);
  return result;
}

export interface RegisteredBuildingController {
  update(markers:readonly RoleVectorMarker[]):void;
  destroy():void;
}

/** Style-bound overlay. Queries happen on settled viewport changes, never for
 * every live GPS coordinate/heading update. Source updates are deduplicated. */
export function createRegisteredBuildingController(map:MapLibreMap):RegisteredBuildingController {
  let destroyed=false,entries:readonly RoleVectorMarker[]=[];
  let descriptorsKey='',lastViewKey='',lastDataKey='';
  const empty:RegisteredBuildingCollection={type:'FeatureCollection',features:[]};
  const sync=(allowTileRetry=false)=>{
    if(destroyed||map.isStyleLoaded()!==true)return;
    const layerPresent=Boolean(map.getLayer('building'));
    const zoom=map.getZoom();
    const center=map.getCenter();
    const viewKey=[descriptorsKey,layerPresent?1:0,Math.floor(zoom*2),
      Math.round(center.lat*1000),Math.round(center.lng*1000)].join('|');
    if(viewKey===lastViewKey&&!allowTileRetry&&map.getSource(REGISTERED_BUILDINGS_SOURCE))return;
    lastViewKey=viewKey;
    const data=layerPresent?selectRegisteredBuildingFootprints(entries,point=>{
      const pixel=map.project([point[1],point[0]]);
      return map.queryRenderedFeatures([pixel.x,pixel.y],{layers:['building']});
    },zoom,point=>map.getBounds().contains([point[1],point[0]])):empty;
    const signature=JSON.stringify(data.features);
    let source=map.getSource(REGISTERED_BUILDINGS_SOURCE) as GeoJSONSource|undefined;
    if(!source){
      map.addSource(REGISTERED_BUILDINGS_SOURCE,{type:'geojson',data});
      source=map.getSource(REGISTERED_BUILDINGS_SOURCE) as GeoJSONSource;
      lastDataKey=signature;
    }else if(lastDataKey!==signature){
      source.setData(data);
      lastDataKey=signature;
    }
    // Do not cover road navigation lines: place paint before the verified route.
    const before=map.getLayer('role-alternative-outline')?'role-alternative-outline':undefined;
    if(!map.getLayer(REGISTERED_BUILDINGS_FILL)){
      map.addLayer({id:REGISTERED_BUILDINGS_FILL,type:'fill',
        source:REGISTERED_BUILDINGS_SOURCE,minzoom:REGISTERED_BUILDING_MIN_ZOOM,
        paint:{'fill-color':['get','color'],'fill-opacity':0.34}},before);
    }
    if(!map.getLayer(REGISTERED_BUILDINGS_OUTLINE)){
      map.addLayer({id:REGISTERED_BUILDINGS_OUTLINE,type:'line',
        source:REGISTERED_BUILDINGS_SOURCE,minzoom:REGISTERED_BUILDING_MIN_ZOOM,
        paint:{'line-color':['get','color'],'line-width':2,'line-opacity':0.85}},before);
    }
  };
  const safeSync=(tileRetry=false)=>{try{sync(tileRetry);}catch{/* Map style can be replaced during loading. */}};
  // idle also covers the first arrival of remote vector building tiles.
  const onIdle=()=>safeSync(lastDataKey==='[]');
  const onMoveEnd=()=>safeSync();
  const onStyleLoad=()=>{lastViewKey='';lastDataKey='';safeSync();};
  map.on('idle',onIdle);
  map.on('moveend',onMoveEnd);
  map.on('style.load',onStyleLoad);
  return {
    update(markers){
      if(destroyed)return;
      const key=markers.filter(entry=>entry.kind==='place').map(entry=>
        [entry.id,entry.coords.join(','),entry.category].join(':')).join('|');
      if(key===descriptorsKey&&map.getSource(REGISTERED_BUILDINGS_SOURCE))return;
      descriptorsKey=key;entries=markers;
      safeSync();
    },
    destroy(){
      if(destroyed)return;
      destroyed=true;
      map.off('idle',onIdle);map.off('moveend',onMoveEnd);map.off('style.load',onStyleLoad);
      // Map is disposed by the owning viewport. Clearing its style here would
      // risk throwing after a fallback and is unnecessary.
    }
  };
}

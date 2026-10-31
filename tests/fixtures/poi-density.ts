import {Map as GlMap,setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import L from 'leaflet';
import {createRoleMaplibreMarkerController} from '../../src/services/mapLibrePlaceMarkers';
import {createLeafletPlaceMarkerController} from '../../src/services/leafletPlaceMarkers';
import {rolePlaceMarkerKey,type RoleVectorMarker} from '../../src/services/vectorPlaceData';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'leaflet/dist/leaflet.css';
const params=new URLSearchParams(location.search),raster=params.has('raster'),navigationMode=params.has('navigation');
const center:[number,number]=[-23.55,-46.63];
const entries:RoleVectorMarker[]=Array.from({length:500},(_,i)=>{
  const lat=center[0]+(i<250?(Math.floor(i/25)-5)*.00009:(Math.floor((i-250)/25)-5)*.025);
  const lng=center[1]+(i<250?(i%25-12)*.00009:((i-250)%25-12)*.015);
  return i%3===0?{kind:'fuel',id:String(i),name:'Posto '+i,coords:[lat,lng],priceLabel:null}:
    {kind:'place',id:String(i),name:'Local '+i,category:i%7===0?'landmark':i%5===0?'museum':i%2?'square':'park',coords:[lat,lng]};
});
const actions={onStation(){},onToll(){},onPlace(){},onReport(){}};
let selectedCoordinates=0;
const ready=(map:GlMap|L.Map,controller:ReturnType<typeof createRoleMaplibreMarkerController>|ReturnType<typeof createLeafletPlaceMarkerController>)=>{
  controller.update(entries,{zoom:11,navigationMode});
  map.on('click',()=>{selectedCoordinates++;});
  (window as any).__poiDensity={entries,map,controller,raster,
    zoom:()=>map.getZoom(),center:()=>raster?(map as L.Map).getCenter():(map as GlMap).getCenter(),
    setView(zoom:number,bearing=0,pitch=0){
      if(raster)(map as L.Map).setView(center,zoom,{animate:false});
      else(map as GlMap).jumpTo({center:[center[1],center[0]],zoom,bearing,pitch});
    },
    selectedCoordinates:()=>selectedCoordinates,
    stats(){
      const rect=document.getElementById('map')!.getBoundingClientRect();
      return entries.filter(entry=>controller.visibleKeys().has(rolePlaceMarkerKey(entry))).map(entry=>{
        const element=document.querySelector<HTMLElement>(`[data-poi-id="${entry.id}"]`)!;
        const icon=element.querySelector('.rdv-map-place-icon')!.getBoundingClientRect();
        const point=raster?(map as L.Map).latLngToContainerPoint(entry.coords):(map as GlMap).project([entry.coords[1],entry.coords[0]]);
        return {id:entry.id,kind:entry.kind,x:icon.x+icon.width/2,y:icon.y+icon.height/2,width:icon.width,height:icon.height,
          error:Math.hypot(icon.x+icon.width/2-rect.x-point.x,icon.y+icon.height/2-rect.y-point.y)};
      });
    }
  };
};
if(raster){
  const map=L.map('map',{center,zoom:11,zoomControl:false,attributionControl:false,zoomAnimation:false});
  map.getContainer().style.background='#edf3ef';ready(map,createLeafletPlaceMarkerController(map,actions));
}else{
  setWorkerUrl(workerUrl);
  const map=new GlMap({container:'map',center:[center[1],center[0]],zoom:11,attributionControl:false,
    style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf3ef'}}]}});
  map.once('load',()=>ready(map,createRoleMaplibreMarkerController(map,actions)));
}

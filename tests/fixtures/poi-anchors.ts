import {Map,setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../src/index.css';
import {createRoleMaplibreMarkerController} from '../../src/services/mapLibrePlaceMarkers';
import type {RoleVectorMarker} from '../../src/services/vectorPlaceData';

setWorkerUrl(workerUrl);
const coords:[number,number]=[-23.55,-46.63];
const entries:RoleVectorMarker[]=[
  {kind:'place',id:'admin:park',name:'Parque do teste',category:'park',coords,managed:true},
  {kind:'fuel',id:'admin:fuel',name:'Posto do teste',coords:[-23.5502,-46.6301],priceLabel:'R$ 5,80',managed:true},
  {kind:'toll',id:'admin:toll',name:'Pedágio do teste',coords:[-23.5499,-46.6298],priceLabel:'R$ 4,00',place:null,managed:true}
];
const map=new Map({container:'map',center:[coords[1],coords[0]],zoom:17,
  style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#eaf0ef'}}]},
  attributionControl:false});
map.once('load',()=>{
  const actions:unknown[]=[];
  const controller=createRoleMaplibreMarkerController(map,{
    onStation:(id,section,mode)=>actions.push({kind:'fuel',id,section,mode}),
    onToll:(id,section,place)=>actions.push({kind:'toll',id,section,place}),
    onPlace:id=>actions.push({kind:'place',id})
  });
  controller.update(entries,{zoom:map.getZoom(),navigationMode:true,location:coords,accuracyMeters:3});
  (window as any).__poiAnchors={map,controller,entries,actions};
});

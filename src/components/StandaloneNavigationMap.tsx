import React,{useEffect,useRef,useState} from 'react';
import {Map as GlMap,setWorkerUrl,type MapMouseEvent} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {InteractiveMapProps} from './InteractiveMap';
import {canRenderVectorMap,ROLE_VECTOR_STYLE,applyRoleVectorPalette} from '../services/mapVectorStyle';
import {createStandaloneMapLibreCameraPort} from '../services/mapCameraController';
import {createNavigationCameraSession} from '../services/navigationCameraSession';
import {mapRouteFitKey,shouldFitMapRoute} from '../services/mapRouteFit';
import {bindManualMapZoom} from '../services/mapUserZoomGestures';
import {bindMapResumeRefresh} from '../services/mapResumeRefresh';
import {updateRoleVectorRoutes} from '../services/mapLibreRouteLayers';
import {createRoleNavigationPins} from '../services/mapLibreNavigationPins';
import {createRoleTripPins} from '../services/mapLibreTripPins';
import {createRoleWeatherPins} from '../services/mapLibreWeatherPins';
import {createRoleMaplibreRoadAlertController} from '../services/mapLibreRoadAlertMarkers';
import {createRoleMaplibreMarkerController} from '../services/mapLibrePlaceMarkers';
import {selectRoleVectorMarkers} from '../services/vectorPlaceData';
import {useFuelStations} from '../hooks/useFuelStations';
import {useNearbyPlaces} from '../hooks/useNearbyPlaces';
import {FuelStationModal} from './FuelStationModal';
import {PlaceModal} from './PlaceModal';
import {TollModal} from './TollModal';
import type {Place} from '../types/admin';
import type {RoadAlert} from '../types/roadAlerts';
import {ROAD_ALERT_TYPES} from '../types/roadAlerts';
import {confirmRoadAlert} from '../hooks/useRoadAlerts';
import {getCurrentDeviceLocation} from '../services/locationService';

setWorkerUrl(workerUrl);
const EMPTY_POINTS:[number,number][]=[];
const COLORS={panoramica:'#059669',turistica:'#0284c7',gastronomica:'#ea580c',rapida:'#2563eb',economica:'#16a34a',equilibrada:'#0d9488'};
const reducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches??false;

/** Active navigation only: native MapLibre owns the canvas, camera and gestures.
 * No Leaflet map or bridge is created in this renderer. Existing pin controllers
 * keep the same actions, data validation and incremental updates. */
export default function StandaloneNavigationMap(props:InteractiveMapProps & {onUnavailable:()=>void}){
  const container=useRef<HTMLDivElement>(null);
  const latest=useRef(props);latest.current=props;
  const [ready,setReady]=useState(false);
  const [station,setStation]=useState<{id:string;section:'prices'|'comments'}|null>(null);
  const [place,setPlace]=useState<Place|null>(null);
  const [toll,setToll]=useState<{id:string;section:'prices'|'comments';place:Place|null}|null>(null);
  const [alert,setAlert]=useState<RoadAlert|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  const [checkMessage,setCheckMessage]=useState('');
  const path=props.routePath || EMPTY_POINTS;
  const discovery=path.length?path:props.originCoords?[props.originCoords]:EMPTY_POINTS;
  const fuel=useFuelStations(discovery,props.showFuelStations??true);
  const places=useNearbyPlaces(discovery,(props.showFuelStations??true)&&discovery.length>0);
  const data=useRef({stations:fuel.stations,places});data.current={stations:fuel.stations,places};
  const runtime=useRef<{render:()=>void;camera:ReturnType<typeof createNavigationCameraSession>}|null>(null);

  useEffect(()=>{
    if(!container.current)return;
    if(!canRenderVectorMap()){latest.current.onUnavailable();return;}
    let disposed=false,loaded=false,failed=false;
    let map:GlMap;
    const fail=()=>{
      if(disposed||failed)return;
      failed=true;latest.current.onUnavailable();
    };
    try{
      const origin=latest.current.originCoords;
      map=new GlMap({container:container.current,style:ROLE_VECTOR_STYLE,
        center:origin?[origin[1],origin[0]]:[-51.9,-14.2],zoom:origin?11:4,
        minZoom:1,maxZoom:19,bearing:0,pitch:0,
        // Rotate the whole map only in a later step, after physical-device QA.
        dragRotate:false,pitchWithRotate:false,touchPitch:false,
        attributionControl:{compact:true}});
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    }catch{fail();return;}
    const timeout=setTimeout(fail,12000);
    const cameraPort=createStandaloneMapLibreCameraPort(map);
    const camera=createNavigationCameraSession(cameraPort,mode=>latest.current.onCameraModeChange?.(mode));
    let fitted:string|null=null;
    let fitInputs:unknown[]=[];
    let waitingForIdle=false;
    let lastFocus:InteractiveMapProps['focusedCoords'];
    const navigation=createRoleNavigationPins(map);
    const trip=createRoleTripPins(map,{openFuel:(id,section)=>setStation({id,section})});
    const weather=createRoleWeatherPins(map);
    const alerts=createRoleMaplibreRoadAlertController(map,entry=>{
      setAlert(entry);setCheckError('');setCheckMessage('');
    });
    const markers=createRoleMaplibreMarkerController(map,{
      onStation:(id,section)=>setStation({id,section}),
      onToll:(id,section,entry)=>setToll({id,section,place:entry}),
      onPlace:id=>setPlace(data.current.places.find(entry=>entry.id===id)??null)
    });
    const render=()=>{
      if(disposed||failed||!loaded)return;
      if(!map.isStyleLoaded()){
        if(!waitingForIdle){waitingForIdle=true;map.once('idle',retry);}
        return;
      }
      const p=latest.current;
      try{
        updateRoleVectorRoutes(map,{routePath:p.routePath||[],alternatives:p.routeAlternatives||[],
          selectedRouteId:p.selectedRouteId,modalityColor:COLORS[p.routeModality||'panoramica'],
          userLocation:p.userLiveCoords,travelledDistanceKm:p.travelledDistanceKm||0,
          totalRouteKm:p.totalRouteKm||0,navigationMode:true,blueRoute:p.blueRoute??false});
        navigation.update({origin:p.originCoords,destination:p.destinationCoords,live:p.userLiveCoords,
          headingDegrees:p.userHeadingDegrees,speedMetersPerSecond:p.userSpeedMetersPerSecond,
          originLabel:p.originLabel||'Origem',destinationLabel:p.destinationLabel||'Destino',
          navigationMode:true,roadStyle:p.roadStyle??false});
        trip.updateStops(p.stops||[]);trip.updateMeetings(p.meetingPoints||[]);
        trip.updateParticipants(p.convoyParticipants||[]);
        weather.update(p.weatherPoints||[],p.showRainLayer??false);
        alerts.update(p.roadAlerts||[]);
        markers.update(selectRoleVectorMarkers({stations:data.current.stations,
          places:p.showFuelStations===false?[]:data.current.places,tolls:p.tolls||[],
          navigationMode:true,tollVehicleType:p.tollVehicleType}));
        const nextInputs=[p.originCoords,p.destinationCoords,p.routePath,p.routeAlternatives];
        if(nextInputs.some((value,index)=>value!==fitInputs[index])){
          fitInputs=nextInputs;
          const key=mapRouteFitKey({origin:p.originCoords,destination:p.destinationCoords,
            routePath:p.routePath||[],alternatives:p.routeAlternatives||[]});
          const points=[...(p.routePath||[]),...(p.originCoords?[p.originCoords]:[]),
            ...(p.destinationCoords?[p.destinationCoords]:[])];
          if(shouldFitMapRoute(fitted,key,points.length>0)){
            fitted=key;
            if(points.length>1)cameraPort.fitRoute(points,{topLeft:[36,70],
              bottomRight:[36,p.roadStyle&&(p.routeAlternatives?.length||0)>0?
                Math.min(360,Math.round(map.getContainer().clientHeight*.46)):64],maxZoom:13});
            else cameraPort.focus(points[0],12);
          }
        }
        camera.update({navigationMode:true,followUser:p.followUser??true,position:p.userLiveCoords,
          centerRequest:p.centerOnUserRequest||0,reducedMotion:reducedMotion()});
        if(p.focusedCoords && p.focusedCoords!==lastFocus){
          camera.explore();cameraPort.focus(p.focusedCoords,15,reducedMotion());
        }
        lastFocus=p.focusedCoords;
      }catch{fail();}
    };
    const retry=()=>{waitingForIdle=false;render();};
    runtime.current={render,camera};
    const publishViewport=()=>{
      const root=container.current?.parentElement;
      if(!root||disposed)return;
      const center=map.getCenter();
      root.dataset.mapCenter=JSON.stringify([center.lat,center.lng]);
      root.dataset.mapZoom=String(map.getZoom());
    };
    map.on('moveend',publishViewport);
    const userGesture=(event:{originalEvent?:unknown})=>{if(event.originalEvent)camera.explore();};
    map.on('dragstart',userGesture);
    map.on('zoomstart',userGesture);
    const unbindGestures=bindManualMapZoom(map.getContainer(),()=>camera.explore());
    const unbindResume=bindMapResumeRefresh(document,window,()=>{
      if(!disposed){map.resize();map.triggerRepaint();}
    });
    const resize=new ResizeObserver(()=>{if(!disposed)map.resize();});
    resize.observe(container.current);
    const select=(event:MapMouseEvent)=>latest.current.onSelectCoordinates?.([event.lngLat.lat,event.lngLat.lng]);
    map.on('click',select);
    const onError=()=>{if(!loaded)fail();};
    map.on('error',onError);
    map.on('webglcontextlost',fail);
    const load=()=>{
      if(disposed||failed)return;
      loaded=true;clearTimeout(timeout);
      applyRoleVectorPalette(map);
      setReady(true);render();
      publishViewport();
    };
    map.once('load',load);
    return ()=>{
      disposed=true;clearTimeout(timeout);runtime.current=null;
      unbindGestures();unbindResume();resize.disconnect();
      map.off('click',select);map.off('dragstart',userGesture);map.off('zoomstart',userGesture);
      map.off('error',onError);map.off('webglcontextlost',fail);map.off('load',load);map.off('idle',retry);map.off('moveend',publishViewport);
      navigation.destroy();trip.destroy();weather.destroy();alerts.destroy();markers.destroy();
      map.stop();map.remove();
    };
  },[]);

  useEffect(()=>{runtime.current?.render();},[props,fuel.stations,places,ready]);

  const check=async(present:boolean)=>{
    if(!alert||checking)return;
    setChecking(true);setCheckError('');
    try{
      const gps=await getCurrentDeviceLocation();
      const answer=await confirmRoadAlert(alert.id,present,gps);
      setCheckMessage(answer.removed?'Ocorrência retirada do mapa após confirmação da comunidade.':'Confirmação registrada. Obrigado por ajudar a manter o mapa atualizado.');
      latest.current.onRoadAlertUpdated?.();
    }catch(error){setCheckError((error as Error).message);}
    finally{setChecking(false);}
  };
  const selectedToll=props.tolls?.find(entry=>entry.id===toll?.id) || (toll?.place?{
    id:toll.id,name:toll.place.name,coords:[toll.place.lat,toll.place.lng] as [number,number],
    sourceUrl:toll.place.sourceUrl,passages:1,price:null}:undefined);
  return <div className={`relative overflow-hidden ${props.className||'w-full h-full'}`} data-map-engine="maplibre-standalone" data-map-ready={ready}>
    <div ref={container} className="w-full h-full"/>
    {station&&<FuelStationModal key={`${station.id}:${station.section}`} stationId={station.id} initialSection={station.section} onClose={()=>setStation(null)}/>}
    {place&&<PlaceModal place={place} onClose={()=>setPlace(null)}/>}
    {toll&&selectedToll&&<TollModal key={`${toll.id}:${toll.section}`} toll={selectedToll} vehicleType={props.tollVehicleType||'car'} initialSection={toll.section} onClose={()=>setToll(null)}/>}
    {alert&&<section role="dialog" aria-label="Confirmar ocorrência no mapa" className="absolute left-1/2 top-4 z-[70] w-[min(330px,calc(100%-24px))] -translate-x-1/2 rounded-[22px] bg-white p-4 shadow-xl">
      <div className="flex justify-between gap-3"><div>
        <p className="text-xs font-semibold text-amber-700">{ROAD_ALERT_TYPES.find(type=>type.id===alert.kind)?.label}</p>
        <h3 className="font-bold text-slate-900">Ainda continua lá?</h3>
      </div><button type="button" aria-label="Fechar confirmação de ocorrência" onClick={()=>setAlert(null)} className="min-h-11 min-w-11 text-slate-700">×</button></div>
      {alert.note&&<p className="mt-2 text-xs text-slate-600">{alert.note}</p>}
      {!checkMessage&&<p className="mt-2 text-xs text-slate-500">Confirme somente se estiver perto do local e com o veículo parado.</p>}
      {checkError&&<p role="alert" className="mt-2 text-xs text-rose-700">{checkError}</p>}
      {checkMessage?<p role="status" className="mt-2 text-xs text-emerald-700">{checkMessage}</p>:<div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={checking} onClick={()=>void check(true)} className="min-h-11 rounded-xl bg-blue-600 text-white">Sim</button>
        <button type="button" disabled={checking} onClick={()=>void check(false)} className="min-h-11 rounded-xl border border-slate-200 text-slate-800">Não</button>
      </div>}
    </section>}
  </div>;
}

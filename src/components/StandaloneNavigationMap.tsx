import {captureMapFallbackViewport,type MapFallbackViewport} from '../services/mapFallbackViewport';
import React,{useEffect,useRef,useState} from 'react';
import {Compass,Layers} from 'lucide-react';
import {updateMapCourse} from '../services/gpsHeading';
import {Map as GlMap,Marker as GlMarker,setWorkerUrl,type MapMouseEvent} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {InteractiveMapProps} from './InteractiveMap';
import {canRenderVectorMap,applyRoleVectorPalette} from '../services/mapVectorStyle';
import {useMapAppearance} from '../hooks/useMapAppearance';
import type {MapTheme} from '../services/mapAppearance';
import {createStandaloneMapLibreCameraPort,orientMapLibreCamera} from '../services/mapCameraController';
import {createNavigationCameraSession} from '../services/navigationCameraSession';
import {createNavigationIdleFollow} from '../services/navigationIdleFollow';
import {assessMapLoadFailure,shouldReloadAfterReconnect} from '../services/mapNetworkRecovery';
import {mapRouteFitKey,shouldFitMapRoute,shouldAutoFitRouteCamera} from '../services/mapRouteFit';
import {bindManualMapZoom} from '../services/mapUserZoomGestures';
import {bindMapResumeRefresh} from '../services/mapResumeRefresh';
import {updateRoleVectorRoutes,queryRoleVectorAlternative} from '../services/mapLibreRouteLayers';
import {updateRoleVectorMilestones} from '../services/mapLibreRouteMilestones';
import {TILE_PROVIDERS,standaloneBaseStyle,type MapStyleType} from '../services/mapStyles';
import {createRoleNavigationPins} from '../services/mapLibreNavigationPins';
import {createRoleTripPins} from '../services/mapLibreTripPins';
import {createRoleWeatherPins} from '../services/mapLibreWeatherPins';
import {createRoleMaplibreRoadAlertController} from '../services/mapLibreRoadAlertMarkers';
import {createRoleMaplibreMarkerController} from '../services/mapLibrePlaceMarkers';
import {createRegisteredBuildingController} from '../services/mapRegisteredBuildings';
import {selectRoleVectorMarkers,type RoleVectorMarker} from '../services/vectorPlaceData';
import {standaloneVisiblePlaces} from '../services/standaloneVisiblePlaces';
import {visiblePlacesSignature} from '../services/mapVisiblePlaces';
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

/** Public maps: native MapLibre owns the canvas, camera and gestures.
 * No Leaflet map or bridge is created in this renderer. Existing pin controllers
 * keep the same actions, data validation and incremental updates. */
export default function StandaloneNavigationMap(props:InteractiveMapProps & {onUnavailable:(style?:MapStyleType,viewport?:MapFallbackViewport)=>void}){
  const container=useRef<HTMLDivElement>(null);
  const {theme:appearanceTheme}=useMapAppearance();
  const appearanceRef=useRef(appearanceTheme);appearanceRef.current=appearanceTheme;
  const latest=useRef(props);latest.current=props;
  const [ready,setReady]=useState(false);
  const [offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  const [baseStyle,setBaseStyle]=useState<MapStyleType>(props.initialStyle||'light');
  const [styleMenu,setStyleMenu]=useState(false);
  const showBaseSelector=!props.navigationMode&&!props.roadStyle;
  const effectiveStyle:MapStyleType=props.navigationMode||props.roadStyle?'light':baseStyle;
  const styleRef=useRef(effectiveStyle);styleRef.current=effectiveStyle;
  const [courseMode,setCourseMode]=useState(false);
  const courseModeRef=useRef(courseMode);courseModeRef.current=courseMode;
  const [station,setStation]=useState<{id:string;section:'prices'|'comments'}|null>(null);
  const [place,setPlace]=useState<Place|null>(null);
  const [toll,setToll]=useState<{id:string;section:'prices'|'comments';place:Place|null}|null>(null);
  const [alert,setAlert]=useState<RoadAlert|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  const [checkMessage,setCheckMessage]=useState('');
  const [viewportCenter,setViewportCenter]=useState<[number,number]|null>(null);
  const path=props.routePath || EMPTY_POINTS;
  const discovery=path.length?path:props.originCoords?[props.originCoords]:viewportCenter?[viewportCenter]:EMPTY_POINTS;
  const fuel=useFuelStations(discovery,props.showFuelStations??true);
  const places=useNearbyPlaces(discovery,(props.showFuelStations??true)&&discovery.length>0);
  const data=useRef({stations:fuel.stations,places});data.current={stations:fuel.stations,places};
  const runtime=useRef<{render:()=>void;orient:()=>void;setBaseStyle:(style:MapStyleType)=>void;setTheme:(theme:MapTheme)=>void;camera:ReturnType<typeof createNavigationCameraSession>}|null>(null);

  useEffect(()=>{
    if(!container.current)return;
    if(!canRenderVectorMap()){latest.current.onUnavailable(styleRef.current);return;}
    let disposed=false,loaded=false,failed=false;
    let map:GlMap;
    let captureFallback:(()=>MapFallbackViewport|undefined)|undefined;
    let activeStyle=styleRef.current,activeTheme=appearanceRef.current,changingStyle=false,tileErrors=0;
    let offlineDuringSession=!navigator.onLine,failedOfflineTiles=false;
    let styleTimeout:ReturnType<typeof setTimeout>|null=null;
    const fail=()=>{
      if(disposed||failed)return;
      failed=true;latest.current.onUnavailable(styleRef.current,captureFallback?.());
    };
    try{
      const origin=latest.current.originCoords;
      map=new GlMap({container:container.current,style:standaloneBaseStyle(activeStyle,activeTheme),
        center:origin?[origin[1],origin[0]]:[-51.9,-14.2],zoom:origin?11:4,
        minZoom:1,maxZoom:TILE_PROVIDERS[activeStyle].maxZoom,bearing:0,
        pitch:latest.current.navigationMode?48:0,maxPitch:65,
        // Preserve native pan, pinch zoom and two-finger rotation while exploring.
        // Camera following pauses on explicit gestures and resumes via GPS.
        dragRotate:true,pitchWithRotate:true,touchPitch:true,
        attributionControl:{compact:true}});
      map.touchZoomRotate.enableRotation();
    }catch{fail();return;}
    const timeout=setTimeout(()=>{
      if(navigator.onLine)fail();
      else failedOfflineTiles=true;
    },12000);
    let course:number|null=null;
    let bearing=0;
    const cameraPort=createStandaloneMapLibreCameraPort(map,()=>bearing);
    let idleFollow:ReturnType<typeof createNavigationIdleFollow>|null=null;
    const camera=createNavigationCameraSession(cameraPort,mode=>{
      if(mode==='following')idleFollow?.reset();
      latest.current.onCameraModeChange?.(mode);
    });
    idleFollow=createNavigationIdleFollow({
      active:()=>Boolean(latest.current.navigationMode),
      resume:()=>camera.resume()
    });
    let fitted:string|null=null;
    let fitInputs:unknown[]=[];
    let waitingForIdle=false;
    let lastFocus:InteractiveMapProps['focusedCoords'];
    captureFallback=()=>loaded?captureMapFallbackViewport(map,{...camera.snapshot(),
      fittedRoute:fitted,focusedCoords:lastFocus},TILE_PROVIDERS[styleRef.current].maxZoom):undefined;
    let drawn:RoleVectorMarker[]=[];
    let editablePin:GlMarker|null=null;
    let editedAt:string|null=null;
    const syncEditablePin=()=>{
      const p=latest.current;
      if(!p.editableWaypoint || !p.onDragWaypoint || p.navigationMode){
        editablePin?.remove();editablePin=null;editedAt=null;return;
      }
      const key=p.editableWaypoint.join(',');
      if(editablePin && editedAt===key)return;
      editablePin?.remove();
      const el=document.createElement('button');
      el.type='button';el.setAttribute('aria-label','Arraste o ponto azul para mudar a rua');
      el.title='Arraste o ponto azul para mudar a rua';
      el.style.cssText='width:42px;height:42px;border:3px solid white;border-radius:50%;background:#2563eb;color:white;font-size:20px;box-shadow:0 2px 14px #1e40af66;cursor:grab;touch-action:none';
      el.textContent='↔';
      const marker=new GlMarker({element:el,draggable:true,anchor:'center'})
        .setLngLat([p.editableWaypoint[1],p.editableWaypoint[0]]).addTo(map);
      marker.on('dragstart',()=>camera.explore());
      marker.on('dragend',()=>{
        const position=marker.getLngLat();
        latest.current.onDragWaypoint?.([position.lat,position.lng]);
      });
      editablePin=marker;editedAt=key;
    };
    let visibleKey='';
    const navigation=createRoleNavigationPins(map);
    const trip=createRoleTripPins(map,{openFuel:(id,section)=>setStation({id,section})});
    const weather=createRoleWeatherPins(map);
    const alerts=createRoleMaplibreRoadAlertController(map,entry=>{
      setAlert(entry);setCheckError('');setCheckMessage('');
    });
    const registeredBuildings=createRegisteredBuildingController(map);
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
      course=updateMapCourse(course,p.userHeadingDegrees,p.userSpeedMetersPerSecond);
      bearing=p.navigationMode&&courseModeRef.current?(course??0):0;
      try{
        const root=container.current?.parentElement;
        if(root)root.dataset.mapIdle='false';
        const featureCount=updateRoleVectorRoutes(map,{routePath:p.routePath||[],alternatives:p.routeAlternatives||[],
          selectedRouteId:p.selectedRouteId,modalityColor:COLORS[p.routeModality||'panoramica'],
          userLocation:p.userLiveCoords,travelledDistanceKm:p.travelledDistanceKm||0,
          totalRouteKm:p.totalRouteKm||0,navigationMode:p.navigationMode??false,blueRoute:p.blueRoute??false});
        if(featureCount>0)container.current?.setAttribute('data-role-vector-routes',String(featureCount));
        else container.current?.removeAttribute('data-role-vector-routes');
        updateRoleVectorMilestones(map,p.routePath||[],COLORS[p.routeModality||'panoramica'],
          !p.navigationMode&&!p.roadStyle&&!p.blueRoute);
        navigation.update({origin:p.originCoords,destination:p.destinationCoords,live:p.userLiveCoords,
          headingDegrees:p.userHeadingDegrees,speedMetersPerSecond:p.userSpeedMetersPerSecond,
          originLabel:p.originLabel||'Origem',destinationLabel:p.destinationLabel||'Destino',
          navigationMode:p.navigationMode??false,roadStyle:p.roadStyle??false});
        trip.updateStops(p.stops||[]);trip.updateMeetings(p.meetingPoints||[]);
        syncEditablePin();
        trip.updateParticipants(p.convoyParticipants||[]);
        weather.update(p.weatherPoints||[],p.showRainLayer??false);
        alerts.update(p.roadAlerts||[]);
        const descriptors=selectRoleVectorMarkers({stations:p.showFuelStations===false?[]:data.current.stations,
          places:p.showFuelStations===false?[]:data.current.places,tolls:p.tolls||[],
          navigationMode:p.navigationMode??false,tollVehicleType:p.tollVehicleType});
        registeredBuildings.update(descriptors);
        markers.update(descriptors,{zoom:map.getZoom(),navigationMode:p.navigationMode??false,
          location:p.userLiveCoords,accuracyMeters:p.userGpsAccuracyMeters,
          showRouteServices:!p.navigationMode&&(p.routePath?.length??0)>1});drawn=descriptors;
        const nextInputs=[p.originCoords,p.destinationCoords,p.routePath,p.routeAlternatives];
        if(nextInputs.some((value,index)=>value!==fitInputs[index])){
          fitInputs=nextInputs;
          const key=mapRouteFitKey({origin:p.originCoords,destination:p.destinationCoords,
            routePath:p.routePath||[],alternatives:p.routeAlternatives||[]});
          const alternatives=p.navigationMode?[]:(p.routeAlternatives||[]).flatMap(option=>option.routePath);
          const points=[...(p.routePath||[]),...alternatives,...(p.originCoords?[p.originCoords]:[]),
            ...(p.destinationCoords?[p.destinationCoords]:[])];
          if(shouldFitMapRoute(fitted,key,points.length>0)){
            fitted=key;
            const snapshot=camera.snapshot();
            // Keep the driver's camera or an explored viewport when a new
            // itinerary arrives. A first route without GPS can still fit.
            if(shouldAutoFitRouteCamera(!!p.navigationMode,
              !!p.userLiveCoords||!!snapshot.position,snapshot.mode==='exploring')){
              if(points.length>1)cameraPort.fitRoute(points,{topLeft:[36,70],
                bottomRight:[36,p.roadStyle&&(p.routeAlternatives?.length||0)>0?
                  Math.min(360,Math.round(map.getContainer().clientHeight*.46)):64],maxZoom:13});
              else cameraPort.focus(points[0],12);
            }
          }
        }
        camera.update({navigationMode:p.navigationMode??false,followUser:p.followUser??true,position:p.userLiveCoords,
          centerRequest:p.centerOnUserRequest||0,reducedMotion:reducedMotion(),bearing,
          maneuverMeters:p.maneuverMeters,speedMetersPerSecond:p.userSpeedMetersPerSecond});
        if(p.focusedCoords && p.focusedCoords!==lastFocus){
          camera.explore();cameraPort.focus(p.focusedCoords,15,reducedMotion());
        }
        lastFocus=p.focusedCoords;
        publishPlaces();
      }catch{fail();}
    };
    const publishPlaces=()=>{
      const p=latest.current;
      if(!loaded||disposed||!p.onVisiblePlacesChange)return;
      const bounds=map.getBounds(),center=map.getCenter();
      const visible=standaloneVisiblePlaces({markers:drawn,stations:data.current.stations,
        places:data.current.places,stops:p.stops||[],center:[center.lat,center.lng],
        contains:([lat,lon])=>bounds.contains([lon,lat])});
      const signature=visiblePlacesSignature(visible);
      if(signature!==visibleKey){visibleKey=signature;p.onVisiblePlacesChange(visible);}
    };
    const retry=()=>{waitingForIdle=false;render();};
    const setBase=(style:MapStyleType,theme:MapTheme=appearanceRef.current,force=false)=>{
      if(disposed||failed||(!force&&style===activeStyle&&theme===activeTheme))return;
      activeStyle=style;activeTheme=theme;changingStyle=true;tileErrors=0;
      const root=container.current?.parentElement;
      if(root){root.dataset.mapIdle='false';root.dataset.mapStyleReady='';}
      if(styleTimeout)clearTimeout(styleTimeout);
      styleTimeout=setTimeout(()=>{
        if(navigator.onLine)fail();
        else failedOfflineTiles=true;
      },12000);
      try{
        map.setMaxZoom(TILE_PROVIDERS[style].maxZoom);
        map.setStyle(standaloneBaseStyle(style,activeTheme),{diff:false});
      }catch{fail();}
    };
    const onNetworkOffline=()=>{
      if(disposed)return;
      offlineDuringSession=true;
      tileErrors=0;
      setOffline(true);
    };
    const onNetworkOnline=()=>{
      if(disposed||failed)return;
      setOffline(false);
      tileErrors=0;
      const reload=shouldReloadAfterReconnect(offlineDuringSession,failedOfflineTiles,map.isStyleLoaded()===true);
      offlineDuringSession=false;failedOfflineTiles=false;
      if(reload)setBase(activeStyle,activeTheme,true);
      else map.triggerRepaint();
    };
    window.addEventListener('offline',onNetworkOffline);
    window.addEventListener('online',onNetworkOnline);
    runtime.current={render,camera,setBaseStyle:style=>setBase(style),setTheme:theme=>setBase(activeStyle,theme),orient:()=>{
      if(disposed||failed||!loaded||!latest.current.navigationMode||camera.snapshot().mode!=='exploring')return;
      // Explicit orientation must also work while route tiles are loading.
      const p=latest.current;
      course=updateMapCourse(course,p.userHeadingDegrees,p.userSpeedMetersPerSecond);
      bearing=courseModeRef.current?(course??0):0;
      orientMapLibreCamera(map,bearing,reducedMotion());
    }};
    const publishViewport=()=>{
      const root=container.current?.parentElement;
      if(!root||disposed)return;
      const center=map.getCenter();
      root.dataset.mapCenter=JSON.stringify([center.lat,center.lng]);
      root.dataset.mapZoom=String(map.getZoom());
      root.dataset.mapBearing=String(map.getBearing());
      const p=latest.current;
      if(!p.routePath?.length&&!p.originCoords){
        const point:[number,number]|null=map.getZoom()<10?null:
          [Math.round(center.lat*100)/100,Math.round(center.lng*100)/100];
        setViewportCenter(current=>current?.[0]===point?.[0]&&current?.[1]===point?.[1]?current:point);
      }
      publishPlaces();
    };
    const publishIdle=()=>{
      const root=container.current?.parentElement;
      if(root&&!disposed){
        root.dataset.mapIdle='true';tileErrors=0;
        if(styleTimeout){clearTimeout(styleTimeout);styleTimeout=null;}
      }
    };
    const markBusy=()=>{
      const root=container.current?.parentElement;
      if(root&&!disposed)root.dataset.mapIdle='false';
    };
    map.on('movestart',markBusy);
    map.on('idle',publishIdle);
    map.on('moveend',publishViewport);
    // Begin exploring on deliberate gestures only. Do not count programmatic
    // GPS panning, and never recenter while fingers are still on the canvas.
    const pointerIds=new Set<number>();
    const pointerDown=(event:PointerEvent)=>{
      if(!latest.current.navigationMode)return;
      pointerIds.add(event.pointerId);
      idleFollow?.hold();
    };
    const pointerUp=(event:PointerEvent)=>{
      pointerIds.delete(event.pointerId);
      if(pointerIds.size===0)idleFollow?.release();
    };
    const gestureEnd=()=>{if(pointerIds.size===0)idleFollow?.release();};
    const userGesture=(event:{originalEvent?:unknown})=>{
      if(!event.originalEvent)return;
      camera.explore();
      idleFollow?.activity();
      idleFollow?.hold();
    };
    map.on('dragstart',userGesture);
    const userZoomGesture=(event:{originalEvent?:unknown})=>{
      if(event.originalEvent)camera.overrideZoom();
      userGesture(event);
    };
    map.on('zoomstart',userZoomGesture);
    map.on('rotatestart',userGesture);
    map.on('pitchstart',userGesture);
    for(const event of ['dragend','zoomend','rotateend','pitchend'] as const)
      map.on(event,gestureEnd);
    map.getContainer().addEventListener('pointerdown',pointerDown,{passive:true});
    document.addEventListener('pointerup',pointerUp,{passive:true});
    document.addEventListener('pointercancel',pointerUp,{passive:true});
    const unbindGestures=bindManualMapZoom(map.getContainer(),()=>{
      camera.overrideZoom();camera.explore();
      idleFollow?.activity();
    });
    const unbindResume=bindMapResumeRefresh(document,window,()=>{
      if(!disposed){map.resize();map.triggerRepaint();}
    });
    const resize=new ResizeObserver(()=>{if(!disposed)map.resize();});
    resize.observe(container.current);
    const select=(event:MapMouseEvent)=>{
      const p=latest.current;
      if(!p.navigationMode && p.onSelectRoute){
        const ids=new Set((p.routeAlternatives||[]).filter(option=>option.id!==p.selectedRouteId).map(option=>option.id));
        try{
          const id=queryRoleVectorAlternative(map,[event.lngLat.lat,event.lngLat.lng],ids);
          if(id){p.onSelectRoute(id);return;}
        }catch{/* A loading style must not swallow an ordinary map click. */}
      }
      p.onSelectCoordinates?.([event.lngLat.lat,event.lngLat.lng]);
    };
    map.on('click',select);
    const onError=()=>{
      const decision=assessMapLoadFailure({
        loaded,changingStyle,online:navigator.onLine,consecutiveErrors:tileErrors
      });
      tileErrors=decision.consecutiveErrors;
      if(decision.retryOnReconnect){
        failedOfflineTiles=true;offlineDuringSession=true;setOffline(true);
      }
      if(decision.fallback)fail();
    };
    map.on('error',onError);
    map.on('webglcontextlost',fail);
    const styleLoaded=()=>{
      if(disposed||failed)return;
      changingStyle=false;tileErrors=0;
      const root=container.current?.parentElement;
      if(root)root.dataset.mapStyleReady=activeStyle;
      if(activeStyle==='light'&&activeTheme==='light')applyRoleVectorPalette(map);
      render();
    };
    map.on('style.load',styleLoaded);
    const load=()=>{
      if(disposed||failed)return;
      loaded=true;clearTimeout(timeout);
      setReady(true);render();
      publishViewport();
    };
    map.once('load',load);
    return ()=>{
      disposed=true;clearTimeout(timeout);if(styleTimeout)clearTimeout(styleTimeout);runtime.current=null;
      idleFollow?.dispose();
      window.removeEventListener('offline',onNetworkOffline);
      window.removeEventListener('online',onNetworkOnline);
      unbindGestures();unbindResume();resize.disconnect();
      map.getContainer().removeEventListener('pointerdown',pointerDown);
      document.removeEventListener('pointerup',pointerUp);
      document.removeEventListener('pointercancel',pointerUp);
      for(const event of ['dragend','zoomend','rotateend','pitchend'] as const)
        map.off(event,gestureEnd);
      map.off('click',select);map.off('dragstart',userGesture);map.off('zoomstart',userZoomGesture);map.off('rotatestart',userGesture);map.off('pitchstart',userGesture);
      editablePin?.remove();
      map.off('error',onError);map.off('webglcontextlost',fail);map.off('load',load);map.off('idle',retry);map.off('moveend',publishViewport);map.off('idle',publishIdle);map.off('movestart',markBusy);map.off('style.load',styleLoaded);
      navigation.destroy();trip.destroy();weather.destroy();alerts.destroy();markers.destroy();
      registeredBuildings.destroy();
      map.stop();map.remove();
    };
  },[]);

  useEffect(()=>{runtime.current?.render();},[props,fuel.stations,places,ready,courseMode]);
  useEffect(()=>{runtime.current?.orient();},[courseMode]);
  useEffect(()=>{runtime.current?.setBaseStyle(effectiveStyle);},[effectiveStyle,ready]);
  useEffect(()=>{runtime.current?.setTheme(appearanceTheme);},[appearanceTheme,ready]);

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
  return <div className={`relative overflow-hidden ${props.className||'w-full h-full'}`} data-map-engine="maplibre-standalone" data-map-ready={ready} data-map-style={effectiveStyle} data-role-theme={appearanceTheme} data-map-network={offline?'offline':'online'}>
    <div ref={container} className="w-full" style={{height:showBaseSelector?'calc(100% - 64px)':'100%'}}/>
    {offline&&<div role="status" aria-live="polite"
      className="pointer-events-none absolute right-3 top-3 z-30 max-w-[240px] rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white shadow-lg">
      Sem internet · novas áreas do mapa e rotas podem não carregar
    </div>}
    {props.navigationMode&&<button type="button" aria-label={courseMode?'Manter o mapa apontado para o norte':'Orientar mapa na direção da viagem'}
      aria-pressed={courseMode} onClick={()=>setCourseMode(value=>!value)}
      title={courseMode?'Orientar pela direção da viagem':'Apontar mapa para o norte'}
      className="absolute bottom-4 right-3 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-blue-700 shadow-[0_6px_20px_rgba(15,23,42,.18)] transition-transform active:scale-95">
      <Compass size={22}/>
    </button>}
    {showBaseSelector&&<div className="pointer-events-none relative z-30 flex h-16 items-center border-t border-slate-200 bg-white px-4">
      <button type="button" title="Alterar visual do mapa" onClick={()=>setStyleMenu(value=>!value)}
        className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-xl">
        <span>{TILE_PROVIDERS[baseStyle].icon}</span><span>{TILE_PROVIDERS[baseStyle].name}</span><Layers size={16}/>
      </button>
      {styleMenu&&<div className="pointer-events-auto absolute bottom-16 left-4 w-52 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
        <span className="block px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Camadas do Mapa</span>
        {(Object.keys(TILE_PROVIDERS) as MapStyleType[]).map(style=><button key={style} type="button"
          aria-pressed={baseStyle===style} onClick={()=>{setBaseStyle(style);setStyleMenu(false);}}
          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold ${baseStyle===style?'bg-emerald-50 text-emerald-800':'text-slate-700'}`}>
          <span>{TILE_PROVIDERS[style].icon}</span><span>{TILE_PROVIDERS[style].name}</span>
        </button>)}
      </div>}
    </div>}
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

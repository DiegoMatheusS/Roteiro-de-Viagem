import {captureMapFallbackViewport,type MapFallbackViewport} from '../services/mapFallbackViewport';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Compass,Layers} from 'lucide-react';
import {updateMapCourse} from '../services/gpsHeading';
import {Map as GlMap,Marker as GlMarker,setWorkerUrl,type MapMouseEvent,type ErrorEvent} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {InteractiveMapProps} from './InteractiveMap';
import {canRenderVectorMap,applyRoleVectorPalette} from '../services/mapVectorStyle';
import {useMapAppearance} from '../hooks/useMapAppearance';
import type {MapTheme} from '../services/mapAppearance';
import {createStandaloneMapLibreCameraPort,orientMapLibreCamera,NAVIGATION_START_PITCH} from '../services/mapCameraController';
import {createNavigationCameraSession} from '../services/navigationCameraSession';
import {createNavigationIdleFollow} from '../services/navigationIdleFollow';
import {createMapGestureUpdates} from '../services/mapGestureUpdates';
import {assessMapLoadFailure,shouldReloadAfterReconnect} from '../services/mapNetworkRecovery';
import {mapRouteFitKey,shouldFitMapRoute,shouldAutoFitRouteCamera} from '../services/mapRouteFit';
import {decideRouteRender,stableList,mapPixelRatio} from '../services/mapRouteRenderPolicy';
import {bindManualMapZoom} from '../services/mapUserZoomGestures';
import {bindMapResumeRefresh} from '../services/mapResumeRefresh';
import {updateRoleVectorRoutes,queryRoleVectorAlternative,queryRoleRouteEditPoint} from '../services/mapLibreRouteLayers';
import {updateRoleVectorMilestones} from '../services/mapLibreRouteMilestones';
import {TILE_PROVIDERS,standaloneBaseStyle,type MapStyleType} from '../services/mapStyles';
import {createRoleNavigationPins} from '../services/mapLibreNavigationPins';
import {createRoleTripPins} from '../services/mapLibreTripPins';
import {createRoleWeatherPins} from '../services/mapLibreWeatherPins';
import {createRoleMaplibreRoadAlertController} from '../services/mapLibreRoadAlertMarkers';
import {createRoleMaplibreMarkerController} from '../services/mapLibrePlaceMarkers';
import {createRegisteredBuildingController} from '../services/mapRegisteredBuildings';
import {listOfflineRegions} from '../services/offlineMapStorage';
import {offlineRegionReady,type OfflineRegion} from '../services/offlineMapRegions';
import {offlineRasterStyle,registerOfflineMapProtocol} from '../services/offlineMapLibre';
import {OFFLINE_REGIONS_CHANGED,readSelectedOfflineRegionId,writeSelectedOfflineRegionId,
  usableOfflineRegion,offlineRegionContains} from '../services/offlineMapSelection';
import {selectRoleVectorMarkers,type RoleVectorMarker} from '../services/vectorPlaceData';
import {standaloneVisiblePlaces} from '../services/standaloneVisiblePlaces';
import {visiblePlacesSignature} from '../services/mapVisiblePlaces';
import {useFuelStations} from '../hooks/useFuelStations';
import {useNearbyPlaces} from '../hooks/useNearbyPlaces';
import {mapPlaceViewport,sameMapPlaceQuery,type MapPlaceQuery} from '../services/mapPlaceViewport';
import {MAP_PLACES_REFRESH_MS} from '../services/placeRefresh';
import {FuelStationModal} from './FuelStationModal';
import {PlaceModal} from './PlaceModal';
import {TollModal} from './TollModal';
import type {Place} from '../types/admin';
import type {RoadAlert} from '../types/roadAlerts';
import {ROAD_ALERT_TYPES} from '../types/roadAlerts';
import {confirmRoadAlert} from '../hooks/useRoadAlerts';
import {getCurrentDeviceLocation} from '../services/locationService';
import {MapTrafficControl} from './MapTrafficControl';
import {createMapLibreTrafficPort} from '../services/mapLibreTraffic';
import {isTrafficMapError} from '../services/trafficFlow';

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
  const [trafficMap,setTrafficMap]=useState<GlMap|null>(null);
  const trafficPort=useMemo(()=>trafficMap?createMapLibreTrafficPort(trafficMap):null,[trafficMap]);
  const [offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  const [baseStyle,setBaseStyle]=useState<MapStyleType>(props.initialStyle||'light');
  const [styleMenu,setStyleMenu]=useState(false);
  const [storedRegions,setStoredRegions]=useState<OfflineRegion[]>([]);
  const [regionId,setRegionId]=useState<string|null>(readSelectedOfflineRegionId);
  const [regionError,setRegionError]=useState('');
  const selectedRegion=usableOfflineRegion(storedRegions,regionId);
  const selectedRegionRef=useRef(selectedRegion);selectedRegionRef.current=selectedRegion;
  const initialChoice=useRef(regionId!==null);
  const showBaseSelector=!props.navigationMode&&!props.roadStyle;
  const effectiveStyle:MapStyleType=props.navigationMode||props.roadStyle?'light':baseStyle;
  const styleRef=useRef(effectiveStyle);styleRef.current=effectiveStyle;
  const [courseMode,setCourseMode]=useState(Boolean(props.navigationMode));
  const courseModeRef=useRef(courseMode);courseModeRef.current=courseMode;
  const [station,setStation]=useState<{id:string;section:'prices'|'comments'}|null>(null);
  const [place,setPlace]=useState<Place|null>(null);
  const [toll,setToll]=useState<{id:string;section:'prices'|'comments';place:Place|null}|null>(null);
  const [alert,setAlert]=useState<RoadAlert|null>(null);
  const [checking,setChecking]=useState(false);
  const [checkError,setCheckError]=useState('');
  const [checkMessage,setCheckMessage]=useState('');
  const [viewportCenter,setViewportCenter]=useState<[number,number]|null>(null);
  const [placeViewport,setPlaceViewport]=useState<MapPlaceQuery|null>(null);
  const path=props.routePath || EMPTY_POINTS;
  const discovery=path.length?path:props.originCoords?[props.originCoords]:viewportCenter?[viewportCenter]:EMPTY_POINTS;
  const fuel=useFuelStations(discovery,props.showFuelStations??true);
  const nearbyPlaces=useNearbyPlaces(placeViewport?.points||EMPTY_POINTS,
    (props.showPlaces??true)&&Boolean(placeViewport),placeViewport?.radiusKm??5,
    {bounds:placeViewport?.bounds,refreshMs:MAP_PLACES_REFRESH_MS,includeFuel:true});
  const places=useMemo(()=>props.showFuelStations===false?nearbyPlaces.filter(place=>place.kind!=='fuel'):nearbyPlaces,
    [nearbyPlaces,props.showFuelStations]);
  const data=useRef({stations:fuel.stations,places});data.current={stations:fuel.stations,places};
  const runtime=useRef<{render:()=>void;orient:()=>void;
    setBaseStyle:(style:MapStyleType)=>void;
    setOfflineRegion:(region:OfflineRegion|null)=>void;
    setTheme:(theme:MapTheme)=>void;
    camera:ReturnType<typeof createNavigationCameraSession>}|null>(null);
  useEffect(()=>{
    let disposed=false;
    const refresh=()=>{
      void listOfflineRegions().then(items=>{
        if(disposed)return;
        setStoredRegions(items);
        const selected=readSelectedOfflineRegionId();
        if(selected&&!usableOfflineRegion(items,selected)){
          writeSelectedOfflineRegionId(null);
          setRegionId(null);
        }
      }).catch(error=>{if(!disposed)setRegionError((error as Error).message);});
    };
    const onVisible=()=>{if(!document.hidden)refresh();};
    refresh();
    window.addEventListener('focus',refresh);
    window.addEventListener(OFFLINE_REGIONS_CHANGED,refresh);
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{
      disposed=true;
      window.removeEventListener('focus',refresh);
      window.removeEventListener(OFFLINE_REGIONS_CHANGED,refresh);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[]);
  const toggleStyleMenu=()=>{
    setStyleMenu(open=>!open);
    // The menu also refreshes storage independently: a browser may suppress
    // focus/custom events while the WebView is paused.
    void listOfflineRegions().then(items=>setStoredRegions(items))
      .catch(error=>setRegionError((error as Error).message));
  };
  const chooseRegion=(region:OfflineRegion|null)=>{
    writeSelectedOfflineRegionId(region?.id??null);
    setRegionId(region?.id??null);
    setRegionError('');
    setStyleMenu(false);
  };
  const availableRegions=storedRegions.filter(region=>region.offlinePermissionConfirmed&&offlineRegionReady(region));

  useEffect(()=>{
    if(!container.current)return;
    if(!canRenderVectorMap()){latest.current.onUnavailable(styleRef.current);return;}
    registerOfflineMapProtocol();
    let disposed=false,loaded=false,failed=false;
    let map:GlMap;
    let captureFallback:(()=>MapFallbackViewport|undefined)|undefined;
    let activeStyle=styleRef.current,activeTheme=appearanceRef.current,changingStyle=false,tileErrors=0;
    let appliedOfflineRegion:OfflineRegion|null=null;
    let needsInitialStyleRecovery=initialChoice.current;
    let offlineDuringSession=!navigator.onLine,failedOfflineTiles=false;
    let styleTimeout:ReturnType<typeof setTimeout>|null=null;
    const fail=()=>{
      if(disposed||failed)return;
      if(appliedOfflineRegion){
        setRegionError('Não foi possível carregar o mapa local. Selecione outra região ou volte ao mapa online.');
        return;
      }
      failed=true;latest.current.onUnavailable(styleRef.current,captureFallback?.());
    };
    try{
      const origin=latest.current.originCoords;
      map=new GlMap({container:container.current,
        style:needsInitialStyleRecovery
          ?{version:8,sources:{},layers:[{id:'role-local-loading',type:'background',
            paint:{'background-color':'#e5e7eb'}}]}
          :standaloneBaseStyle(activeStyle,activeTheme),
        center:origin?[origin[1],origin[0]]:[-51.9,-14.2],zoom:origin?11:4,
        minZoom:1,maxZoom:TILE_PROVIDERS[activeStyle].maxZoom,bearing:0,
        pitch:latest.current.navigationMode?NAVIGATION_START_PITCH:0,maxPitch:65,
        // Preserve native pan, pinch zoom and two-finger rotation while exploring.
        // Camera following pauses on explicit gestures and resumes via GPS.
        dragRotate:true,pitchWithRotate:true,touchPitch:true,
        // Navigation draws to a canvas capped at 2x: on 3x phones that is 2.25x
        // fewer pixels per frame while panning. Overlays here never contain
        // symbol layers, so label collisions only need to run inside each source.
        pixelRatio:mapPixelRatio(window.devicePixelRatio,Boolean(latest.current.navigationMode)),
        crossSourceCollisions:false,
        attributionControl:{compact:true}});
      map.touchZoomRotate.enableRotation();
    }catch{fail();return;}
    const timeout=setTimeout(()=>{
      if(navigator.onLine)fail();
      else failedOfflineTiles=true;
    },12000);
    let course:number|null=null;
    let bearing=0;
    let lastCenterRequest=0;
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
    // Route projection scans the road geometry. Limit repeated scans from
    // high-frequency position/heading updates while keeping route changes immediate.
    let lastRouteRenderAt=-Infinity;
    let lastRouteRenderInputs:unknown[]=[];
    let lastRouteFeatureCount=0;
    let mapTouchActive=false;
    // Progress that arrived while the user was panning/zooming; published once
    // the map settles so the route upload never lands in the middle of a gesture.
    let routeDeferred=false;
    // True while a finger is down, or after the user took the camera and it is
    // still moving (wheel zoom, pinch and fling inertia). Following the GPS does
    // not count: that movement is ours.
    const userInteracting=()=>mapTouchActive||
      (Boolean(latest.current.navigationMode)&&camera.snapshot().mode==='exploring'&&map.isMoving());
    let viewportDirty=false;
    let drawn:RoleVectorMarker[]=[];
    let lastOverlayInputs:unknown[]=[];
    let lastMarkerInputs:unknown[]=[];
    let editablePin:GlMarker|null=null;
    let editedAt:string|null=null;
    let selectedEditPoint:[number,number]|null=null;
    let selectedEditPath=latest.current.routePath;
    const clearEditor=()=>{
      editablePin?.remove();editablePin=null;editedAt=null;selectedEditPoint=null;
    };
    const syncEditablePin=()=>{
      const p=latest.current;
      if(!p.onDragWaypoint || p.navigationMode || selectedEditPath!==p.routePath){
        clearEditor();selectedEditPath=p.routePath;return;
      }
      if(!selectedEditPoint)return;
      const key=selectedEditPoint.join(',');
      if(editablePin && editedAt===key)return;
      editablePin?.remove();
      const el=document.createElement('button');
      el.className='role-route-edit-marker';
      el.type='button';el.setAttribute('aria-label','Arraste a bolinha para alterar a rota');
      el.title='Arraste para outra rua';
      el.style.cssText='width:44px;height:44px;border:0;padding:0;background:transparent;display:grid;place-items:center;cursor:grab;touch-action:none';
      const dot=document.createElement('span');
      dot.style.cssText='width:20px;height:20px;border:3px solid #2563eb;border-radius:50%;background:white;box-shadow:0 2px 9px #1e40af66';
      el.append(dot);
      el.addEventListener('click',event=>event.stopPropagation());
      const marker=new GlMarker({element:el,draggable:true,anchor:'center'})
        .setLngLat([selectedEditPoint[1],selectedEditPoint[0]]).addTo(map);
      marker.on('dragstart',()=>camera.explore());
      marker.on('dragend',()=>{
        const position=marker.getLngLat();
        selectedEditPoint=[position.lat,position.lng];
        editedAt=selectedEditPoint.join(',');
        latest.current.onDragWaypoint?.(selectedEditPoint);
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
    // DOM GPS pins and camera commands do not depend on tile/style sources.
    // Keep them live even before the first map load, while zoom fetches new
    // tiles, or while a route source is being processed by the worker.
    const updateLiveViewport=()=>{
      const p=latest.current;
      navigation.update({origin:p.originCoords,destination:p.destinationCoords,live:p.userLiveCoords??p.userLastKnownCoords,
        liveStale:!p.userLiveCoords&&!!p.userLastKnownCoords,
        headingDegrees:p.userHeadingDegrees,speedMetersPerSecond:p.userSpeedMetersPerSecond,
        originLabel:p.originLabel||'Origem',destinationLabel:p.destinationLabel||'Destino',
        navigationMode:p.navigationMode??false,roadStyle:p.roadStyle??false});
      camera.update({navigationMode:p.navigationMode??false,followUser:p.followUser??true,position:p.userLiveCoords,
        centerRequest:p.centerOnUserRequest||0,reducedMotion:reducedMotion(),bearing,
        maneuverMeters:p.maneuverMeters,speedMetersPerSecond:p.userSpeedMetersPerSecond});
      if(p.focusedCoords && p.focusedCoords!==lastFocus){
        camera.explore();cameraPort.focus(p.focusedCoords,15,reducedMotion());
      }
      lastFocus=p.focusedCoords;
    };
    const render=()=>{
      if(disposed||failed)return;
      const p=latest.current;
      if(p.navigationMode&&(p.centerOnUserRequest??0)>lastCenterRequest){
        // Explicit GPS restores the complete driving view, including course-up.
        lastCenterRequest=p.centerOnUserRequest??0;
        courseModeRef.current=true;setCourseMode(true);
      }
      course=updateMapCourse(course,p.userHeadingDegrees,p.userSpeedMetersPerSecond);
      bearing=p.navigationMode&&courseModeRef.current?(course??0):0;
      try{
        if(!loaded||!map.isStyleLoaded()){
          updateLiveViewport();
          if(!waitingForIdle){waitingForIdle=true;map.once('idle',retry);}
          return;
        }
        const root=container.current?.parentElement;
        if(root)root.dataset.mapIdle='false';
        // `value||[]` in callers creates a new empty list per render; compare
        // empty lists as one instance so GPS fixes do not look like route changes.
        const routeInputs=[stableList(p.routePath),stableList(p.routeAlternatives),p.selectedRouteId,
          p.routeModality,p.navigationMode,p.blueRoute,p.totalRouteKm,activeTheme];
        const routeChanged=routeInputs.some((value,index)=>value!==lastRouteRenderInputs[index]);
        const now=performance.now();
        // Guidance publishes progress at most every 250 ms (up to 1 s on very
        // long routes) and never while the user is moving the map. A changed
        // itinerary, style or first render always updates immediately.
        const routeDecision=decideRouteRender({routeChanged,interacting:userInteracting(),
          navigationMode:Boolean(p.navigationMode),now,lastRenderAt:lastRouteRenderAt,
          routeVertices:p.routePath?.length??0});
        if(routeDecision==='defer')routeDeferred=true;
        if(routeDecision==='render'){
          routeDeferred=false;
          lastRouteRenderAt=now;
          lastRouteRenderInputs=routeInputs;
          lastRouteFeatureCount=updateRoleVectorRoutes(map,{routePath:p.routePath||[],alternatives:p.routeAlternatives||[],
            selectedRouteId:p.selectedRouteId,modalityColor:COLORS[p.routeModality||'panoramica'],
            userLocation:p.userLiveCoords,travelledDistanceKm:p.travelledDistanceKm||0,
            totalRouteKm:p.totalRouteKm||0,navigationMode:p.navigationMode??false,blueRoute:p.blueRoute??false,theme:activeTheme});
        }
        const featureCount=lastRouteFeatureCount;
        if(featureCount>0)container.current?.setAttribute('data-role-vector-routes',String(featureCount));
        else container.current?.removeAttribute('data-role-vector-routes');
        updateRoleVectorMilestones(map,p.routePath||[],COLORS[p.routeModality||'panoramica'],
          !p.navigationMode&&!p.roadStyle&&!p.blueRoute);
        // GPS can trigger many renders while driving. Keep the live navigation
        // marker responsive, but do not rebuild static overlays on each fix.
        const overlayInputs=[stableList(p.stops),stableList(p.meetingPoints),
          stableList(p.convoyParticipants),stableList(p.weatherPoints),p.showRainLayer,
          stableList(p.roadAlerts),Boolean(p.onDragWaypoint),p.navigationMode,p.showFuelStations,p.showPlaces,
          stableList(p.tolls),p.tollVehicleType,data.current.stations,data.current.places,
          stableList(p.routePath)];
        const overlaysChanged=overlayInputs.some((value,index)=>value!==lastOverlayInputs[index]);
        if(overlaysChanged){
          lastOverlayInputs=overlayInputs;
          trip.updateStops(p.stops||[]);trip.updateMeetings(p.meetingPoints||[]);
          syncEditablePin();
          trip.updateParticipants(p.convoyParticipants||[]);
          weather.update(p.weatherPoints||[],p.showRainLayer??false);
          alerts.update(p.roadAlerts||[]);
          drawn=selectRoleVectorMarkers({stations:p.showFuelStations===false?[]:data.current.stations,
            places:p.showPlaces===false?[]:data.current.places,tolls:p.tolls||[],
            navigationMode:p.navigationMode??false,tollVehicleType:p.tollVehicleType,viewportScopedPlaces:p.showPlaces!==false});
          registeredBuildings.update(p.navigationMode?[]:drawn);
        }
        weather.avoidPosition(p.userLiveCoords??p.userLastKnownCoords);
        // The marker controller handles GPS proximity; update only when its
        // inputs change. While driving, skip proximity work for the hidden
        // route-service markers altogether.
        const markerInputs=[drawn,p.navigationMode,p.userLiveCoords,p.userGpsAccuracyMeters];
        const markersChanged=overlaysChanged||markerInputs.some((value,index)=>value!==lastMarkerInputs[index]);
        if(markersChanged){
          lastMarkerInputs=markerInputs;
          markers.update(drawn,{zoom:map.getZoom(),navigationMode:p.navigationMode??false,
            location:p.userLiveCoords,accuracyMeters:p.userGpsAccuracyMeters,
            showRouteServices:!p.navigationMode&&(p.routePath?.length??0)>1});
        }
        const nextInputs=[p.originCoords,p.destinationCoords,stableList(p.routePath),stableList(p.routeAlternatives)];
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
        updateLiveViewport();
        // GPS/speed renders do not change which POIs the viewport contains.
        // moveend publishes visibility after pan/zoom; changed overlays
        // publish immediately even if the camera stays still.
        if(overlaysChanged||viewportDirty){publishPlaces();viewportDirty=false;}
        // Catalog/DOM-pin updates do not necessarily schedule a MapLibre frame.
        // Do not leave a fully loaded stationary map marked busy waiting for an
        // idle event that only fires after another actual map render.
        if(!map.isMoving()&&map.loaded())publishIdle();
      }catch{fail();}
    };
    const mapUpdates=createMapGestureUpdates(render);
    const requestRender=()=>mapUpdates.request();
    const publishPlaces=()=>{
      const p=latest.current;
      if(!loaded||disposed||!p.onVisiblePlacesChange)return;
      const bounds=map.getBounds(),center=map.getCenter();
      const visible=standaloneVisiblePlaces({markers:drawn,stations:data.current.stations,
        places:data.current.places,stops:p.stops||[],center:[center.lat,center.lng],
        contains:([lat,lon])=>bounds.contains([lon,lat]),zoom:map.getZoom(),
        showRouteServices:!p.navigationMode&&(p.routePath?.length??0)>1});
      const signature=visiblePlacesSignature(visible);
      if(signature!==visibleKey){visibleKey=signature;p.onVisiblePlacesChange(visible);}
    };
    const retry=()=>{waitingForIdle=false;requestRender();};
    const setBase=(style:MapStyleType,theme:MapTheme=appearanceRef.current,
      force=false,region:OfflineRegion|null=appliedOfflineRegion)=>{
      if(disposed||failed)return;
      if(region&&style===activeStyle&&theme!==activeTheme&&!force){
        activeTheme=theme;return;
      }
      if(!force&&!needsInitialStyleRecovery&&style===activeStyle&&
        theme===activeTheme&&region?.id===appliedOfflineRegion?.id)return;
      needsInitialStyleRecovery=false;
      // A style replacement invalidates all MapLibre overlay sources/layers.
      lastOverlayInputs=[];lastMarkerInputs=[];
      lastRouteRenderInputs=[];lastRouteRenderAt=-Infinity;
      appliedOfflineRegion=region;
      setRegionError('');
      activeStyle=style;activeTheme=theme;changingStyle=true;tileErrors=0;
      const root=container.current?.parentElement;
      if(root){root.dataset.mapIdle='false';root.dataset.mapStyleReady='';}
      if(styleTimeout)clearTimeout(styleTimeout);
      styleTimeout=setTimeout(()=>{
        if(appliedOfflineRegion||navigator.onLine)fail();
        else failedOfflineTiles=true;
      },12000);
      try{
        map.setMaxZoom(region?19:TILE_PROVIDERS[style].maxZoom);
        map.setStyle(region?offlineRasterStyle(region):standaloneBaseStyle(style,activeTheme),{diff:false});
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
      if(appliedOfflineRegion){
        offlineDuringSession=false;failedOfflineTiles=false;
        map.triggerRepaint();
        return; // An offline tile source never needs a network reconnect.
      }
      const reload=shouldReloadAfterReconnect(offlineDuringSession,failedOfflineTiles,map.isStyleLoaded()===true);
      offlineDuringSession=false;failedOfflineTiles=false;
      if(reload)setBase(activeStyle,activeTheme,true);
      else map.triggerRepaint();
    };
    window.addEventListener('offline',onNetworkOffline);
    window.addEventListener('online',onNetworkOnline);
    runtime.current={render:requestRender,camera,
      // Persisted offline choice starts on a blank local canvas. Never load the
      // remote base before checking that a complete stored package exists.
      setBaseStyle:style=>{
        if(needsInitialStyleRecovery&&readSelectedOfflineRegionId())return;
        setBase(style);
      },
      setOfflineRegion:region=>{
        if(needsInitialStyleRecovery&&!region&&readSelectedOfflineRegionId())return;
        const previous=appliedOfflineRegion;
        setBase(activeStyle,activeTheme,false,region);
        if(region&&previous?.id!==region.id&&!latest.current.navigationMode){
          map.fitBounds([[region.bounds.west,region.bounds.south],
            [region.bounds.east,region.bounds.north]],
            {padding:45,maxZoom:region.maxZoom,duration:reducedMotion()?0:380});
        }
      },
      setTheme:theme=>{
        if(needsInitialStyleRecovery&&readSelectedOfflineRegionId())return;
        setBase(activeStyle,theme);
      },
      orient:()=>{
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
      // Run after MapLibre finishes updating its own gesture state, so the
      // deferred route upload sees a map that has really stopped moving.
      if(routeDeferred)queueMicrotask(()=>{
        if(disposed||!routeDeferred)return;
        lastRouteRenderAt=-Infinity;requestRender();
      });
      const center=map.getCenter();
      root.dataset.mapCenter=JSON.stringify([center.lat,center.lng]);
      root.dataset.mapZoom=String(map.getZoom());
      root.dataset.mapBearing=String(map.getBearing());
      root.dataset.mapPitch=String(map.getPitch());
      const bounds=map.getBounds();
      const query=mapPlaceViewport({south:bounds.getSouth(),north:bounds.getNorth(),
        west:bounds.getWest(),east:bounds.getEast()},map.getZoom());
      // Retain loaded markers at their real coordinates on a far zoom-out.\n      if(query||map.getZoom()>=9)setPlaceViewport(current=>sameMapPlaceQuery(current,query)?current:query);
      const p=latest.current;
      if(!p.routePath?.length&&!p.originCoords){
        const point:[number,number]|null=map.getZoom()<10?null:
          [Math.round(center.lat*100)/100,Math.round(center.lng*100)/100];
        setViewportCenter(current=>current?.[0]===point?.[0]&&current?.[1]===point?.[1]?current:point);
      }
      viewportDirty=true;
      if(mapUpdates.paused())requestRender();
      else {publishPlaces();viewportDirty=false;}
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
      pointerIds.add(event.pointerId);
      mapTouchActive=true;
      mapUpdates.hold();
      if(!latest.current.navigationMode)return;
      // Claim the camera on first contact, before MapLibre emits dragstart or
      // zoomstart. GPS may otherwise issue easeTo between touchstart and the
      // native gesture threshold, interrupting slow pans and pinch gestures.
      camera.explore();
      idleFollow?.activity();
      idleFollow?.hold();
    };
    const pointerUp=(event:PointerEvent)=>{
      // Releases outside this map must not schedule map work.
      if(!pointerIds.delete(event.pointerId))return;
      gestureEnd();
    };
    const gestureEnd=()=>{
      // A released finger can leave inertial pan/zoom running. Wait for native
      // moveend as well, then coalesce pending data after 160 ms of quiet.
      if(!mapTouchActive||pointerIds.size>0||map.isMoving())return;
      mapTouchActive=false;
      idleFollow?.release();
      lastRouteRenderAt=-Infinity;
      mapUpdates.release();
    };
    const cancelGesture=()=>{
      pointerIds.clear();
      if(!mapTouchActive)return;
      mapTouchActive=false;idleFollow?.release();mapUpdates.release();
    };
    const onGestureVisibility=()=>{if(document.hidden)cancelGesture();};
    const userGesture=(event:{originalEvent?:unknown})=>{
      if(!event.originalEvent)return;
      mapTouchActive=true;mapUpdates.hold();
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
    map.on('moveend',gestureEnd);
    map.getContainer().addEventListener('pointerdown',pointerDown,{passive:true});
    document.addEventListener('pointerup',pointerUp,{passive:true});
    document.addEventListener('pointercancel',pointerUp,{passive:true});
    window.addEventListener('blur',cancelGesture);
    document.addEventListener('visibilitychange',onGestureVisibility);
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
      if(!p.navigationMode && p.onDragWaypoint){
        try{
          const point=queryRoleRouteEditPoint(map,[event.lngLat.lat,event.lngLat.lng]);
          if(point){
            selectedEditPoint=point;selectedEditPath=p.routePath;
            syncEditablePin();return;
          }
        }catch{/* A missing route layer must not create an arbitrary waypoint. */}
        clearEditor();
      }
      p.onSelectCoordinates?.([event.lngLat.lat,event.lngLat.lng]);
    };
    map.on('click',select);
    const onError=(event:ErrorEvent)=>{
      if(isTrafficMapError(event))return;
      if(appliedOfflineRegion){
        // Missing local tiles must never force online Leaflet/OSM fallback.
        if(!changingStyle&&++tileErrors>=3)fail();
        return;
      }
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
      if(root)root.dataset.mapStyleReady=appliedOfflineRegion?'offline':activeStyle;
      if(!appliedOfflineRegion&&activeStyle==='light')
        applyRoleVectorPalette(map,activeTheme);
      requestRender();
    };
    map.on('style.load',styleLoaded);
    const load=()=>{
      if(disposed||failed)return;
      loaded=true;clearTimeout(timeout);
      setReady(true);setTrafficMap(map);requestRender();
      publishViewport();
    };
    map.once('load',load);
    return ()=>{
      disposed=true;clearTimeout(timeout);if(styleTimeout)clearTimeout(styleTimeout);runtime.current=null;
      mapUpdates.dispose();
      idleFollow?.dispose();
      window.removeEventListener('offline',onNetworkOffline);
      window.removeEventListener('online',onNetworkOnline);
      unbindGestures();unbindResume();resize.disconnect();
      map.getContainer().removeEventListener('pointerdown',pointerDown);
      document.removeEventListener('pointerup',pointerUp);
      document.removeEventListener('pointercancel',pointerUp);
      window.removeEventListener('blur',cancelGesture);
      document.removeEventListener('visibilitychange',onGestureVisibility);
      for(const event of ['dragend','zoomend','rotateend','pitchend'] as const)
        map.off(event,gestureEnd);
      map.off('moveend',gestureEnd);
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
  useEffect(()=>{runtime.current?.setOfflineRegion(selectedRegion);},[selectedRegion,ready]);

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
  return <div className={`relative overflow-hidden ${props.className||'w-full h-full'}`} data-map-engine="maplibre-standalone" data-map-ready={ready} data-map-style={selectedRegion?'offline':effectiveStyle}
    data-map-offline-region={selectedRegion?.id||''}
    data-map-offline-available={availableRegions.length}
    data-map-style-menu={styleMenu?'open':'closed'}
    data-role-theme={appearanceTheme} data-map-network={offline?'offline':'online'}>
    <div ref={container} className="w-full" style={{height:showBaseSelector?'calc(100% - 64px)':'100%'}}/>
    <MapTrafficControl port={trafficPort} offline={offline||Boolean(regionId)} navigation={Boolean(props.navigationMode)}/>
    {selectedRegion&&<div role="status" aria-live="polite"
      className="pointer-events-none absolute left-3 top-3 z-30 max-w-[220px] rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg">
      Mapa local: {selectedRegion.name} · zoom {selectedRegion.minZoom}–{selectedRegion.maxZoom}
      <span className="block font-normal text-[10px]">Base armazenada neste aparelho; rotas novas ainda exigem conexão.</span>
      {props.userLiveCoords&&!offlineRegionContains(selectedRegion,props.userLiveCoords)&&
        <span className="block mt-1 text-amber-800">Seu GPS está fora da região armazenada.</span>}
    </div>}
    {regionError&&<div role="alert"
      className="absolute left-3 top-24 z-40 max-w-[270px] rounded-xl border border-rose-200 bg-white p-3 text-xs text-rose-800 shadow-lg">
      {regionError}
    </div>}
    {offline&&!selectedRegion&&<div role="status" aria-live="polite"
      className="pointer-events-none absolute right-3 top-3 z-30 max-w-[240px] rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white shadow-lg">
      Sem internet · novas áreas do mapa e rotas podem não carregar
    </div>}
    {!showBaseSelector&&availableRegions.length>0&&<div className="absolute bottom-20 left-3 z-40">
      <button type="button" aria-label="Selecionar mapa offline armazenado"
        onClick={toggleStyleMenu}
        className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-blue-800 shadow-lg">
        {selectedRegion?'Mapa local ativo':'Mapas locais'}
      </button>
      {styleMenu&&<div className="absolute bottom-11 left-0 max-h-52 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <button type="button" onClick={()=>chooseRegion(null)} className="block w-full rounded-lg p-2 text-left text-xs">
          Usar mapa online
        </button>
        {availableRegions.map(region=><button type="button" key={region.id}
          onClick={()=>chooseRegion(region)}
          aria-pressed={selectedRegion?.id===region.id}
          className="block w-full rounded-lg p-2 text-left text-xs text-slate-800">
          {region.name} · zoom {region.minZoom}–{region.maxZoom}
        </button>)}

      </div>}
    </div>}
    {props.navigationMode&&<button type="button" aria-label={courseMode?'Manter o mapa apontado para o norte':'Orientar mapa na direção da viagem'}
      aria-pressed={courseMode} onClick={()=>setCourseMode(value=>!value)}
      title={courseMode?'Orientar pela direção da viagem':'Apontar mapa para o norte'}
      className="absolute bottom-4 right-3 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-blue-700 shadow-[0_6px_20px_rgba(15,23,42,.18)] transition-transform active:scale-95">
      <Compass size={22}/>
    </button>}
    {showBaseSelector&&<div className="pointer-events-none relative z-30 flex h-16 items-center border-t border-slate-200 bg-white px-4">
      <button type="button" title="Alterar visual do mapa" onClick={toggleStyleMenu}
        className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-xl">
        <span>{selectedRegion?'🗺️':TILE_PROVIDERS[baseStyle].icon}</span>
        <span>{selectedRegion?('Mapa local: '+selectedRegion.name):TILE_PROVIDERS[baseStyle].name}</span><Layers size={16}/>
      </button>
      {styleMenu&&<div className="pointer-events-auto absolute bottom-16 left-4 w-52 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
        <span className="block px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Camadas do Mapa</span>
        {(Object.keys(TILE_PROVIDERS) as MapStyleType[]).map(style=><button key={style} type="button"
          aria-pressed={!selectedRegion&&baseStyle===style}
          onClick={()=>{chooseRegion(null);setBaseStyle(style);}}
          className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold ${baseStyle===style?'bg-emerald-50 text-emerald-800':'text-slate-700'}`}>
          <span>{TILE_PROVIDERS[style].icon}</span><span>{TILE_PROVIDERS[style].name}</span>
        </button>)}
        {availableRegions.length>0&&<div className="mt-2 border-t border-slate-200 pt-2">
          <span className="block px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Mapas armazenados</span>
          {availableRegions.map(region=><button type="button" key={region.id}
            aria-pressed={selectedRegion?.id===region.id}
            onClick={()=>chooseRegion(region)}
            className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-blue-800 hover:bg-blue-50">
            {region.name} · zoom {region.minZoom}–{region.maxZoom}
          </button>)}
        </div>}
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

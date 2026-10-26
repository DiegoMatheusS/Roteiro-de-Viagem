import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TripPreviewScreen} from '../../src/components/TripPreviewScreen';
import {createRoadDraft,recalculateDragRoute} from '../../src/services/touristCircuit';
import {GUEST_NAVIGATION_VEHICLE as vehicle} from '../../src/services/guestNavigationVehicle';
import type {TripPlan} from '../../src/types';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
import '../../src/role-figma.css';
const path:[number,number][]=[[-23.55,-46.63],[-23.555,-46.625],[-23.56,-46.62]];
const initial={...createRoadDraft({originName:'Origem',originCoords:path[0],
  destinationName:'Destino',destinationCoords:path[2],vehicle,circular:false,limits:{mode:'destination'}}),
  routePath:path,distanceKm:1.5,durationMinutes:10,routingSource:'OSRM' as const};
function Fixture(){
  const [trip,setTrip]=useState<TripPlan>(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const edit=async(point:[number,number])=>{
    setBusy(true);setError('');
    try{setTrip(await recalculateDragRoute(trip,point,vehicle));}
    catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  };
  return <><TripPreviewScreen trip={trip} vehicleType="car" isSaved={false}
    onClose={()=>{}} onAdjust={()=>{}} onStart={()=>{}} onSave={()=>{}}
    onDragWaypoint={point=>void edit(point)} mapEditing={busy} mapEditError={error}/>
    <output hidden data-testid="route-path">{JSON.stringify(trip.routePath)}</output>
    <output hidden data-testid="edit-error">{error}</output></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

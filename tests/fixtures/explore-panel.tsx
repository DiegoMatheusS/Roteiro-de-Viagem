import React from 'react';
import {createRoot} from 'react-dom/client';
import {ToursTab} from '../../src/components/ToursTab';
import '../../src/index.css';
import '../../src/role-figma.css';
import 'leaflet/dist/leaflet.css';

const startedTrips:unknown[]=[];
Object.assign(window,{__exploreStartedTrips:startedTrips});
createRoot(document.getElementById('root')!).render(<ToursTab currentVehicle={null}
  savedTripIds={[]} onStartTrip={trip=>{startedTrips.push(trip);}} onSaveTrip={()=>{}}/>);

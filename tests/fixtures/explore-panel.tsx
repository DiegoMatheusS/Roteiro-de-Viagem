import React from 'react';
import {createRoot} from 'react-dom/client';
import {ToursTab} from '../../src/components/ToursTab';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';

createRoot(document.getElementById('root')!).render(<ToursTab currentVehicle={null}
  savedTripIds={[]} onStartTrip={()=>{}} onSaveTrip={()=>{}}/>);

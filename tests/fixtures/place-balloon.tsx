import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from '../../src/contexts/AuthContext';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
const gps:[number,number]=[-23.55,-46.63];
createRoot(document.getElementById('root')!).render(<AuthProvider><div style={{width:'100vw',height:'100dvh'}}>
  <InteractiveMap roadStyle userLiveCoords={gps} userGpsAccuracyMeters={5} showFuelStations
    navigationMode={new URLSearchParams(location.search).has('navigation')} centerOnUserRequest={1}/>
</div></AuthProvider>);

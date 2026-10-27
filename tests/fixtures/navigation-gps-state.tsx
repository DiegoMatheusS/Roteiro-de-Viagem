import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import {useTripTracking} from '../../src/hooks/useTripTracking';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
const path:[number,number][]=[[-23.55,-46.63],[-23.54,-46.62]];
function Fixture(){
  const [trip,setTrip]=useState('gps-1');
  const [request,setRequest]=useState(0);
  const tracking=useTripTracking(trip);
  const fix=tracking.status==='ready'?tracking.position:null;
  return <><div style={{height:620,width:390}}><InteractiveMap navigationMode routePath={path}
    userLiveCoords={fix?.coords} userLastKnownCoords={tracking.lastKnownPosition?.coords}
    userHeadingDegrees={fix?.headingDegrees} userSpeedMetersPerSecond={fix?.speedMetersPerSecond}
    centerOnUserRequest={request} showFuelStations={false}/></div>
    <output data-testid="gps-status">{tracking.status}</output>
    <output data-testid="speed">{tracking.speedKmH??'unknown'}</output>
    <button disabled={!fix} onClick={()=>setRequest(value=>value+1)}>GPS</button>
    <button onClick={()=>setTrip('gps-2')}>Outra viagem</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

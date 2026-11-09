import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
const route:[number,number][]=[[-23.55,-46.63],[-23.5496,-46.63],[-23.5496,-46.6285]];
function Fixture(){
  const [fix,setFix]=useState({lat:-23.55,lon:-46.63,timestamp:10000,speed:10,heading:0});
  const [lost,setLost]=useState(false),[heading,setHeading]=useState(230),[show,setShow]=useState(true);
  useEffect(()=>{Object.assign(window,{__navigationMotion:{setFix,setLost,setHeading,setShow}});},[]);
  return <><div style={{width:390,height:620}}>{show&&<InteractiveMap navigationMode roadStyle
    routePath={route} destinationCoords={route[2]} userLiveCoords={lost?undefined:[fix.lat,fix.lon]}
    userLastKnownCoords={[fix.lat,fix.lon]} userGpsTimestamp={fix.timestamp} userGpsAccuracyMeters={6}
    userSpeedMetersPerSecond={fix.speed} userHeadingDegrees={fix.heading} userDeviceHeadingDegrees={heading}
    showFuelStations={false} showPlaces={false}/>}</div><output data-testid="raw-latitude">{fix.lat}</output></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

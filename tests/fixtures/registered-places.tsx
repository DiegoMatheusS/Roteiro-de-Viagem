import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
const gps:[number,number]=[-23.55,-46.63];
function Fixture(){
  const [fuel,setFuel]=useState(false);
  const [navigation,setNavigation]=useState(false);
  const [focus,setFocus]=useState<[number,number]|undefined>();
  return <><div style={{width:390,height:620}}><InteractiveMap roadStyle
    userLiveCoords={gps} userGpsAccuracyMeters={5} showFuelStations={fuel} centerOnUserRequest={1}
    navigationMode={navigation} focusedCoords={focus}
    originCoords={navigation?[-24.5,-47.5]:undefined}
    destinationCoords={navigation?[-23.54,-46.62]:undefined}
    routePath={navigation?[[-24.5,-47.5],gps,[-23.54,-46.62]]:[]}/></div>
    <button onClick={()=>setFuel(value=>!value)}>Alternar postos de teste</button>
    <button onClick={()=>setNavigation(true)}>Iniciar navegação de teste</button>
    <button onClick={()=>setFocus([-23.4,-46.5])}>Explorar outro bairro</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

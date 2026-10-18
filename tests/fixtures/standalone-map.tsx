import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import '../../src/index.css';
function Fixture(){
  const [coords,setCoords]=useState<[number,number]>([-23.55,-46.63]);
  const [request,setRequest]=useState(0);
  const [mode,setMode]=useState('following');
  const [show,setShow]=useState(true);
  return <><div style={{width:390,height:620}}>{show&&<InteractiveMap navigationMode
    routePath={[[-23.55,-46.63],[-23.56,-46.62]]} destinationCoords={[-23.56,-46.62]}
    userLiveCoords={coords} showFuelStations={false} centerOnUserRequest={request}
    onCameraModeChange={setMode}/>}</div><output data-testid="mode">{mode}</output>
    <button onClick={()=>setCoords([-23.555,-46.625])}>Mover GPS</button>
    <button onClick={()=>setRequest(value=>value+1)}>Seguir GPS</button>
    <button onClick={()=>setShow(false)}>Remover mapa</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import '../../src/index.css';
const path:[number,number][]=[[-23.55,-46.63],[-23.56,-46.62]];
function Fixture(){
  const [coords,setCoords]=useState<[number,number]>();
  const [request,setRequest]=useState(0);
  return <><div style={{width:390,height:620}}><InteractiveMap roadStyle
    originCoords={path[0]} destinationCoords={path[1]} routePath={path}
    userLiveCoords={coords} centerOnUserRequest={request} showFuelStations={false}/></div>
    <output data-testid="request">{request}</output>
    <button onClick={()=>setRequest(value=>value+1)}>Centralizar GPS</button>
    <button onClick={()=>setCoords([-23.555,-46.625])}>Receber GPS</button>
    <button onClick={()=>setCoords([-23.58,-46.60])}>Mover GPS</button>
    <button onClick={()=>setCoords(undefined)}>GPS indisponível</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

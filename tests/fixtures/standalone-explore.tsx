import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap,type MapVisiblePlace} from '../../src/components/InteractiveMap';
import type {RouteStop} from '../../src/types';
import '../../src/index.css';
const start:[number,number]=[-23.55,-46.63],end:[number,number]=[-23.56,-46.62];
const fast=[start,end];
const scenic=[start,[-23.545,-46.62] as [number,number],end];
const alternatives=[{id:'fast',routePath:fast},{id:'scenic',routePath:scenic}];
const stops:RouteStop[]=[{id:'local',name:'Mirante local',category:'mirante',lat:-23.55,lng:-46.63,
  description:'Parada do teste',recommendedMinutes:10}];
function Fixture(){
  const [selected,setSelected]=useState('fast');
  const [coords,setCoords]=useState<[number,number]>([-23.55,-46.63]);
  const [visible,setVisible]=useState<MapVisiblePlace[]>([]);
  const [request,setRequest]=useState(0);
  const [mapClicks,setMapClicks]=useState(0);
  return <><div style={{width:390,height:620}}><InteractiveMap roadStyle blueRoute
    originCoords={start} destinationCoords={end} routePath={selected==='fast'?fast:scenic}
    routeAlternatives={alternatives} selectedRouteId={selected} onSelectRoute={setSelected}
    userLiveCoords={coords} showFuelStations={false} stops={stops} onVisiblePlacesChange={setVisible}
    centerOnUserRequest={request} onSelectCoordinates={()=>setMapClicks(value=>value+1)}/></div>
    <output data-testid="selected">{selected}</output><output data-testid="map-clicks">{mapClicks}</output>
    <output data-testid="visible">{visible.map(item=>item.name).join(',')}</output>
    <button onClick={()=>setCoords([-23.555,-46.625])}>Mover GPS</button>
    <button onClick={()=>setRequest(value=>value+1)}>Centralizar GPS</button>
    <button onClick={()=>setSelected('fast')}>Selecionar rápida</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

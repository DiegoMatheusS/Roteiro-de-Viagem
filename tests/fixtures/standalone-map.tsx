import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import type {WeatherPoint} from '../../src/types';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
const weatherPoints:WeatherPoint[]=[
  {locationName:'Ponto de chuva atual',coords:[-23.55,-46.63],passTime:'10:30',tempC:22,condition:'Chuva Fraca',rainProb:80,windKmH:10},
  {locationName:'Próximo ponto de chuva',coords:[-23.555,-46.625],passTime:'10:40',tempC:22,condition:'Chuva Fraca',rainProb:80,windKmH:10}
];
function Fixture(){
  const [coords,setCoords]=useState<[number,number]>([-23.55,-46.63]);
  const [request,setRequest]=useState(0);
  const [heading,setHeading]=useState(90);
  const [mode,setMode]=useState('following');
  const [show,setShow]=useState(true);
  const [path,setPath]=useState<[number,number][]>([[-23.55,-46.63],[-23.56,-46.62]]);
  return <><div style={{width:390,height:620}}>{show&&<InteractiveMap navigationMode
    weatherPoints={weatherPoints} showRainLayer
    routePath={path} destinationCoords={path[path.length-1]}
    userLiveCoords={coords} userHeadingDegrees={heading} userSpeedMetersPerSecond={10} showFuelStations={false} centerOnUserRequest={request}
    onCameraModeChange={setMode}/>}</div><output data-testid="mode">{mode}</output>
    <button onClick={()=>setCoords(current=>[current[0]-.005,current[1]+.005])}>Mover GPS</button>
    <button onClick={()=>setHeading(current=>(current+90)%360)}>Mudar direção GPS</button>
    <button onClick={()=>setRequest(value=>value+1)}>Seguir GPS</button>
    <output data-testid="route-target">{path.at(-1)?.join(',')}</output>
    <button onClick={()=>setPath(current=>[[-23.55,-46.63],current.at(-1)?.[0]===-23.7?[-23.8,-46.5]:[-23.7,-46.4]])}>Novo percurso</button>
    <button onClick={()=>setShow(false)}>Remover mapa</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

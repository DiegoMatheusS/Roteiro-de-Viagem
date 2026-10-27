import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActiveTripModal} from '../../src/components/ActiveTripModal';
import {createRoadDraft} from '../../src/services/touristCircuit';
import type {Vehicle,NavigationManeuver} from '../../src/types';
import '../../src/index.css';
const vehicle:Vehicle={id:'fixture',type:'car',brand:'Teste',model:'Carro',nickname:'Carro',year:2026,
  fuelType:'gasolina',tankCapacityLiters:40,maxPassengers:4,odometerKm:0,
  consumption:{referenceUrban:10,referenceHighway:12,referenceAverage:11,userConfigured:11,source:'teste',sourceDate:'2026'}};
const circuit:[number,number][]=[[0,0],[0,.01],[.01,.01],[.01,0],[0,0]];
const crossing:[number,number][]=[[0,-.01],[0,0],[0,.01],[.01,.01],[.01,0],[0,0],[-.01,0]];
const circuitSteps:NavigationManeuver[]=[
  {coords:circuit[0],distanceFromStartKm:0,type:'depart',name:'Saída'},
  {coords:circuit[1],distanceFromStartKm:1,type:'turn',modifier:'right',name:'Primeira curva'},
  {coords:circuit[3],distanceFromStartKm:3,type:'turn',modifier:'right',name:'Retorno'},
  {coords:circuit[4],distanceFromStartKm:4,type:'arrive',name:'Destino'}
];
const crossingSteps:NavigationManeuver[]=[
  {coords:crossing[0],distanceFromStartKm:0,type:'depart',name:'Saída'},
  {coords:crossing[1],distanceFromStartKm:1,type:'turn',modifier:'right',name:'Trecho de ida'},
  {coords:crossing[5],distanceFromStartKm:5,type:'turn',modifier:'left',name:'Trecho de volta'},
  {coords:crossing[6],distanceFromStartKm:6,type:'arrive',name:'Destino'}
];
const draft=createRoadDraft({originName:'Saída',originCoords:circuit[0],destinationName:'Destino',
  destinationCoords:circuit[4],vehicle,circular:true,limits:{mode:'destination'}});
function Fixture(){
  const [scenario,setScenario]=useState('start');
  const isCrossing=scenario.startsWith('crossing');
  const path=isCrossing?crossing:circuit;
  const distanceKm=isCrossing?(scenario==='crossing-out'?1:5):scenario==='start'?0:3.98;
  const coords:[number,number]=scenario==='off-route'?[.1,.1]:[0,0];
  const trip={...draft,routePath:path,routeSteps:isCrossing?crossingSteps:circuitSteps,
    destinationCoords:path[path.length-1],distanceKm:isCrossing?6:4,durationMinutes:15};
  return <><ActiveTripModal isOpen trip={trip} vehicle={vehicle}
    tracking={{status:'ready',lastKnownPosition:null,error:null,retry:()=>{},distanceKm,speedKmH:18,
      position:{coords,accuracyMeters:5,speedMetersPerSecond:5,headingDegrees:90,timestamp:Date.now()}}}
    conditions={{busy:false,weatherError:'',tollError:'',refresh:()=>{}}}
    onClose={()=>{}} onEndTrip={()=>{}} onCompleteTrip={()=>({newAchievements:[],leveledUp:false})}
    onOpenSos={()=>{}} onOpenShareModal={()=>{}} onReturnHome={()=>{}}
    onNavigationReroute={()=>{}} onStopVisited={()=>{}}
    onManualStopComplete={()=>false} onSkipStop={()=>false}/>
    <div style={{position:'fixed',bottom:4,left:4,zIndex:1000,background:'white'}}>
      <button onClick={()=>setScenario('return')}>Simular volta ao início</button>
      <button onClick={()=>setScenario('crossing-out')}>Simular cruzamento na ida</button>
      <button onClick={()=>setScenario('crossing-return')}>Simular cruzamento na volta</button>
      <button onClick={()=>setScenario('off-route')}>Simular fora da rota</button>
    </div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

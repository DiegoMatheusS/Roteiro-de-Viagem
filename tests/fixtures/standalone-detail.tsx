import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InteractiveMap} from '../../src/components/InteractiveMap';
import type {ConvoyParticipant,MeetingPoint} from '../../src/types';
import '../../src/index.css';
const path:[number,number][]=[[-23.55,-46.63],[-23.555,-46.625],[-23.56,-46.62]];
const now=new Date().toISOString();
const people:ConvoyParticipant[]=[
  {id:'owner',name:'Organizador',vehicleType:'car',isOrganizer:true,isSharingLocation:true,
    coords:[-23.552,-46.628],lastLocationTimestamp:now,joinedAt:now},
  {id:'rider',name:'Participante',vehicleType:'motorcycle',isOrganizer:false,isSharingLocation:true,
    coords:[-23.554,-46.626],lastLocationTimestamp:now,joinedAt:now}
];
const meetings:MeetingPoint[]=[{id:'meeting',title:'Ponto de encontro',category:'minha_escolha',
  coords:[-23.547,-46.626],order:1,confirmedArrivedParticipantIds:[]}];
function Fixture(){
  const [participants,setParticipants]=useState(people);
  return <><div style={{width:390,height:620}}><InteractiveMap routePath={path}
    convoyParticipants={participants} meetingPoints={meetings} showFuelStations={false}/></div>
    <button onClick={()=>setParticipants(current=>current.map(person=>person.id==='rider'?
      {...person,coords:[-23.553,-46.624],lastLocationTimestamp:new Date().toISOString()}:person))}>Mover participante</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

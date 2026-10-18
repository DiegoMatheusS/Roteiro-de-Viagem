import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DestinationExplorer} from '../../src/components/DestinationExplorer';
import {destinationExploreKey} from '../../src/services/destinationIdentity';
import type {LocationSelection} from '../../src/types/itinerary';

function Fixture(){
  const [target,setTarget]=useState<LocationSelection|null>({name:'Praça Central',coords:[0,0.01]});
  const [latest,setLatest]=useState('');
  const change=(lon:number)=>{
    setTarget({name:'Praça Central',coords:[0,lon]});
    setLatest('');
  };
  return <main>
    <div style={{position:'fixed',zIndex:120,top:0,left:0,background:'white'}}>
      <button onClick={()=>change(0.02)}>Trocar para destino B</button>
      <button onClick={()=>change(0.03)}>Trocar para destino C</button>
      <output data-testid="destination-route">{latest}</output>
    </div>
    {target?.coords&&<DestinationExplorer
      key={destinationExploreKey(target)} target={target}
      vehicle={null} gpsAvailable={true} getOrigin={async()=>[0,0]}
      onMapRoute={(_origin,options)=>setLatest(options[0].id)}
      onStartTrip={()=>setLatest('STARTED')}
      onClose={()=>{setTarget(null);setLatest('');}}
    />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

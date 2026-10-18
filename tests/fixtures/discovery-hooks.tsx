import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useFuelStations} from '../../src/hooks/useFuelStations';
import {useNearbyPlaces} from '../../src/hooks/useNearbyPlaces';

function Fixture(){
  const [coords,setCoords]=useState<[number,number][]>([[-23.55,-46.63]]);
  const [enabled,setEnabled]=useState(true);
  const fuel=useFuelStations(coords,enabled);
  const places=useNearbyPlaces(coords,enabled);
  return <main>
    <output data-testid="stations">{fuel.stations.map(item=>item.id).join(',')}</output>
    <output data-testid="places">{places.map(item=>item.id).join(',')}</output>
    <output data-testid="loading">{String(fuel.loading)}</output>
    <button onClick={()=>setCoords([[-23.6,-46.5]])}>Trocar região</button>
    <button onClick={()=>setEnabled(false)}>Desativar busca</button>
    <button onClick={()=>setEnabled(true)}>Ativar busca</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

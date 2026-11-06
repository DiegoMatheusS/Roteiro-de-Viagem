import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LocationSearch} from '../../src/components/LocationSearch';
import type {LocationSelection} from '../../src/types/itinerary';
import '../../src/index.css';
import 'leaflet/dist/leaflet.css';
function Addresses(){
  const [origin,setOrigin]=useState<LocationSelection>({name:''}),[destination,setDestination]=useState<LocationSelection>({name:''});
  return <main className="p-4 space-y-5 bg-white text-slate-900">
    <LocationSearch label="Origem" value={origin} onChange={setOrigin} bias={[-23.55,-46.63]} allowManualPin/>
    <LocationSearch label="Destino" value={destination} onChange={setDestination} bias={[-23.55,-46.63]} allowManualPin/>
    <output data-testid="origin">{JSON.stringify(origin)}</output>
    <output data-testid="destination">{JSON.stringify(destination)}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Addresses/>);

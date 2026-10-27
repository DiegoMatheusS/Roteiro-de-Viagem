import React from 'react';
import {createRoot} from 'react-dom/client';
import {NavigationHome} from '../../src/components/NavigationHome';
import '../../src/index.css';
import '../../src/role-figma.css';
import 'leaflet/dist/leaflet.css';
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<NavigationHome
  currentVehicle={null} trips={[]} signedIn={false} onStartTrip={noop} onSaveTrip={noop}
  onOpenAllTrips={noop} onOpenAllSuggestions={noop} onOpenProfile={noop}
  onAdvancedPlanning={noop} onViewTripDetails={noop} onLogin={noop}
  onCreateConvoy={async()=>false} onJoinConvoy={noop}/>);

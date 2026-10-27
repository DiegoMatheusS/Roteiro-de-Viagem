import React from 'react';
import {createRoot} from 'react-dom/client';
import {NavigationHome} from '../../src/components/NavigationHome';
import {MapTab} from '../../src/components/MapTab';
import '../../src/index.css';
import '../../src/role-figma.css';
import 'leaflet/dist/leaflet.css';
const noop=()=>{};
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('screen')==='map'
  ?<MapTab currentVehicle={null} activeTrip={null} plannedTrip={null}
    conditions={{busy:false,weatherError:'',tollError:'',refresh:noop}}
    onBackToMenu={noop} onEndTrip={noop} onContinueTrip={noop} onOpenRoutePlanner={noop}
    onNavigateHome={noop} onOpenSos={noop}/>
  :<NavigationHome
  currentVehicle={null} trips={[]} signedIn={false} onStartTrip={noop} onSaveTrip={noop}
  onOpenAllTrips={noop} onOpenAllSuggestions={noop} onOpenProfile={noop}
  onAdvancedPlanning={noop} onViewTripDetails={noop} onLogin={noop}
  onCreateConvoy={async()=>false} onJoinConvoy={noop}/>);

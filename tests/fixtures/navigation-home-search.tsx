import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NavigationHome} from '../../src/components/NavigationHome';
import {MapTab} from '../../src/components/MapTab';
import {RoutePlanningModal} from '../../src/components/RoutePlanningModal';
import {GUEST_NAVIGATION_VEHICLE} from '../../src/services/guestNavigationVehicle';
import type {TripPlan} from '../../src/types';
import '../../src/index.css';
import '../../src/role-figma.css';
import 'leaflet/dist/leaflet.css';
const noop=()=>{};
const start=(trip:TripPlan)=>{Object.assign(window,{__startedRouteTrip:trip});};
function Fixture(){
  const [planning,setPlanning]=useState<TripPlan|null>(null);
  const params=new URLSearchParams(location.search);
  const vehicle=params.has('vehicle')?{...GUEST_NAVIGATION_VEHICLE,id:'fixture-car'}:null;
  return <>{params.get('screen')==='map'
    ?<MapTab currentVehicle={null} activeTrip={null} plannedTrip={null}
      conditions={{busy:false,weatherError:'',tollError:'',refresh:noop}}
      onBackToMenu={noop} onEndTrip={noop} onContinueTrip={noop} onOpenRoutePlanner={noop}
      onNavigateHome={noop} onOpenSos={noop} onStartTrip={start}/>
    :<NavigationHome
      currentVehicle={vehicle} trips={[]} signedIn={false} onStartTrip={start} onSaveTrip={noop}
      onOpenAllTrips={noop} onOpenAllSuggestions={noop} onOpenProfile={noop}
      onAdvancedPlanning={noop} onViewTripDetails={setPlanning} onLogin={noop}
      onCreateConvoy={async()=>false} onJoinConvoy={noop}/>}
    {planning&&vehicle&&<RoutePlanningModal isOpen vehicle={vehicle} presetTrip={planning}
      origin={planning.originName} originCoords={planning.originCoords}
      destination={planning.destinationName} destinationCoords={planning.destinationCoords}
      onClose={()=>setPlanning(null)} onStartTrip={start} onSaveTrip={noop} onOpenShareModal={noop}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

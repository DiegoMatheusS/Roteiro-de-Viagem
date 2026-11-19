import {useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {RoadAlertIcon} from '../../src/components/RoadAlertIcons';
import {RoadAlertReporter} from '../../src/components/RoadAlertReporter';
import type {DeviceLocation} from '../../src/services/locationService';
import {UpcomingRoadAlertBanner} from '../../src/components/UpcomingRoadAlertBanner';
import {ROAD_ALERT_TYPES,type RoadAlertType} from '../../src/types/roadAlerts';
import {createRoadAlertIconElement} from '../../src/services/mapRoadAlerts';
import '../../src/index.css';
import '../../src/role-navigation-figma.css';
function MapPin({kind}:{kind:RoadAlertType}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const element=createRoadAlertIconElement(kind);root.current?.append(element);return()=>element.remove();},[kind]);
  return <div ref={root} data-map-art={kind}/>;
}
function Gallery(){
  const withGps=new URLSearchParams(location.search).has('submit');
  const fix:DeviceLocation|null=withGps?{coords:[-23.55,-46.63],accuracyMeters:5,speedMetersPerSecond:0,timestamp:Date.now()}:null;
  return <main style={{padding:16,background:'#fff'}}>
  <RoadAlertReporter location={fix} speedKmH={0}/>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:16}}>
    {ROAD_ALERT_TYPES.map(type=><article key={type.id} style={{display:'grid',justifyItems:'center',gap:8,padding:8,border:'1px solid #ccc',borderRadius:12}}>
      <RoadAlertIcon kind={type.id} size={90}/><MapPin kind={type.id}/><span style={{fontSize:12,textAlign:'center'}}>{type.label}</span>
    </article>)}
  </div>
  <div style={{position:'relative',height:150,marginTop:20}}><UpcomingRoadAlertBanner kind="oil_spill" distanceKm={.24}/></div>
</main>;}
createRoot(document.getElementById('root')!).render(<Gallery/>);

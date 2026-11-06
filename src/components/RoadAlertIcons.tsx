import {useId,type SVGProps} from 'react';
import type {RoadAlertType} from '../types/roadAlerts';
import {ROAD_ALERT_ART_URL,ROAD_ALERT_ARTWORK,roadAlertClip,POTHOLE_PATHS} from '../services/roadAlertArtwork';

// Pictogramas da situação real; evitam reutilizar o triângulo genérico de perigo.
type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

export function RoadAlertIcon({kind,size=36,...props}:IconProps&{kind:RoadAlertType}){
  const id=`road-alert-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  if(kind==='pothole')return <PotholeIcon size={size} {...props}/>;
  const artwork=ROAD_ALERT_ARTWORK[kind];
  return <svg width={size} height={size} viewBox={artwork.viewBox} fill="none" aria-hidden="true"
    data-road-alert-art={kind} {...props}>
    <defs><clipPath id={id}><polygon points={roadAlertClip(artwork)}/></clipPath></defs>
    <image href={ROAD_ALERT_ART_URL} width="1536" height="1024" clipPath={`url(#${id})`}/>
  </svg>;
}

export function PotholeIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {POTHOLE_PATHS.map(d=><path key={d} d={d}/>)}
  </svg>;
}

export function TollBoothIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 8h18M4.5 8V5.5h15V8M6 8v13M18 8v13M9 21v-8h6v8" />
    <path d="M3 13h6M15 13h6M9.5 5.5v-2h5v2" />
  </svg>;
}

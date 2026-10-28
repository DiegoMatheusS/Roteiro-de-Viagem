import React from 'react';
import {AlertTriangle,CarFront,Cctv,Construction,Waves,Wrench} from 'lucide-react';
import {PotholeIcon,PoliceOfficerIcon,RobberyIcon} from './RoadAlertIcons';
import type {RoadAlertType} from '../types/roadAlerts';
import {roadAlertBannerText} from '../services/roadAlertPresentation';

const icons:Record<RoadAlertType,React.ElementType>={
  pothole:PotholeIcon,
  broken_vehicle:CarFront,
  accident:CarFront,
  speed_camera:Cctv,
  road_obstruction:Construction,
  flooded_road:Waves,
  police_presence:PoliceOfficerIcon,
  robbery:RobberyIcon
};

export function UpcomingRoadAlertBanner({kind,distanceKm}:{kind:RoadAlertType;distanceKm:number}){
  const Icon=icons[kind];
  return <div role="status" aria-live="polite" className="rdv-nav-upcoming-alert" data-testid="road-alert-banner">
    <span className="rdv-nav-upcoming-icon" aria-hidden="true">
      <Icon size={34} strokeWidth={2}/>
      {kind==='broken_vehicle'&&<Wrench size={16} className="rdv-nav-upcoming-icon-badge" strokeWidth={2.5}/>}
      {kind==='accident'&&<AlertTriangle size={16} className="rdv-nav-upcoming-icon-badge" strokeWidth={2.5}/>}
    </span>
    <strong className="rdv-nav-upcoming-copy">{roadAlertBannerText(kind,distanceKm)}</strong>
  </div>;
}

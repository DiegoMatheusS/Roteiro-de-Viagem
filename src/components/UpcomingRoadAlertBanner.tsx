import React from 'react';
import {RoadAlertIcon} from './RoadAlertIcons';
import type {RoadAlert,RoadAlertType} from '../types/roadAlerts';
import {roadAlertBannerText} from '../services/roadAlertPresentation';

export function UpcomingRoadAlertBanner({kind,distanceKm,alert}:{kind:RoadAlertType;distanceKm:number;alert?:RoadAlert}){
  return <div role="status" aria-live="polite" className="rdv-nav-upcoming-alert" data-testid="road-alert-banner">
    <span className="rdv-nav-upcoming-icon" aria-hidden="true">
      <RoadAlertIcon kind={kind} size={38}/>
    </span>
    <strong className="rdv-nav-upcoming-copy">{roadAlertBannerText(kind,distanceKm,alert)}</strong>
  </div>;
}

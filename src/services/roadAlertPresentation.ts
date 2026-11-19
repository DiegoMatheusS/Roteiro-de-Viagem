import type {RoadAlert,RoadAlertType} from '../types/roadAlerts';

const messages:Record<RoadAlertType,string>={
  pothole:'Buraco na pista',
  broken_vehicle:'Carro quebrado na pista',
  accident:'Acidente na pista',
  speed_camera:'Radar de velocidade',
  road_obstruction:'Obstáculo na pista',
  flooded_road:'Alagamento na pista',
  police_presence:'Policiamento na via',
  robbery:'Assalto reportado na via',
  roadworks:'Obras na via',
  congestion:'Congestionamento',
  heavy_rain:'Chuva forte',
  oil_spill:'Óleo na pista'
};

export function roadAlertTitle(alert:Pick<RoadAlert,'kind'|'cameraKind'|'limitKmh'>):string{
  const label=alert.cameraKind==='RED_LIGHT'?'Fiscalização de semáforo':
    alert.cameraKind==='SECTION'?'Radar de trecho':messages[alert.kind];
  return `${label}${alert.limitKmh&&alert.cameraKind!=='RED_LIGHT'?` · ${alert.limitKmh} km/h`:''}`;
}

/** Distance follows the verified route, rounded to avoid false GPS precision. */
export function roadAlertBannerText(kind:RoadAlertType,distanceKm:number,alert?:RoadAlert):string {
  const title=alert?roadAlertTitle(alert):messages[kind];
  const meters=Math.max(0,Math.round(distanceKm*100)*10);
  if(meters<30)return `${title} logo à frente`;
  if(meters>=1000)return `${title} a ${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km`;
  return `${title} a ${meters} metros`;
}

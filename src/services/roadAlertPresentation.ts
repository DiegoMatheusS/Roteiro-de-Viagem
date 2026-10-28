import type {RoadAlertType} from '../types/roadAlerts';

const messages:Record<RoadAlertType,string>={
  pothole:'Buraco na pista',
  broken_vehicle:'Carro quebrado na pista',
  accident:'Acidente na pista',
  speed_camera:'Radar de velocidade',
  road_obstruction:'Obstáculo na pista',
  flooded_road:'Alagamento na pista',
  police_presence:'Policiamento na via',
  robbery:'Assalto reportado na via'
};

/** Distance follows the verified route, rounded to avoid false GPS precision. */
export function roadAlertBannerText(kind:RoadAlertType,distanceKm:number):string {
  const meters=Math.max(0,Math.round(distanceKm*100)*10);
  if(meters<30)return `${messages[kind]} logo à frente`;
  if(meters>=1000)return `${messages[kind]} a ${(meters/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km`;
  return `${messages[kind]} a ${meters} metros`;
}

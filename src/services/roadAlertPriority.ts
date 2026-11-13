import type {RoadAlertType} from '../types/roadAlerts';

export type RoadAlertSeverity='critical'|'high'|'info';

/** Prioridade visual, independente da distância: nada é ocultado por raio. */
export function roadAlertSeverity(kind:RoadAlertType):RoadAlertSeverity {
  switch(kind){
    case 'accident':
    case 'road_obstruction':
    case 'flooded_road':
    case 'robbery':
    case 'oil_spill':
      return 'critical';
    case 'pothole':
    case 'broken_vehicle':
    case 'roadworks':
    case 'congestion':
    case 'heavy_rain':
      return 'high';
    default:
      return 'info';
  }
}
export function roadAlertLayerPriority(kind:RoadAlertType):number {
  const level=roadAlertSeverity(kind);
  return level==='critical'?300:level==='high'?200:100;
}

import type {RoadAlertType} from '../types/roadAlerts';

// The supplied transparent sheet is stored unchanged. SVG viewBoxes isolate
// each drawing; polygon clips exclude adjacent artwork without repainting it.
export const ROAD_ALERT_ART_URL='/icons/road-alerts.png';
export const ROAD_ALERT_ARTWORK:Record<Exclude<RoadAlertType,'pothole'>,{viewBox:string;clip?:string}>={
  accident:{viewBox:'12 248 310 258'},
  broken_vehicle:{viewBox:'330 200 283 308'},
  roadworks:{viewBox:'620 220 279 287'},
  road_obstruction:{viewBox:'906 231 286 276'},
  congestion:{viewBox:'1208 225 308 267'},
  heavy_rain:{viewBox:'10 592 278 308'},
  police_presence:{viewBox:'287 587 220 290'},
  flooded_road:{viewBox:'504 620 265 259',clip:'510,624 738,624 738,680 769,680 769,879 505,879 505,680 533,680'},
  speed_camera:{viewBox:'762 601 266 278',clip:'762,601 1020,601 1020,735 1000,772 920,788 920,879 820,879 820,788 772,788 772,671 762,671'},
  oil_spill:{viewBox:'971 595 298 286',clip:'1117,570 1300,890 935,890'},
  robbery:{viewBox:'1246 595 278 288',clip:'1246,595 1524,595 1524,883 1280,883 1280,815 1250,785 1246,750'}
};
export function roadAlertClip(artwork:{viewBox:string;clip?:string}):string {
  if(artwork.clip)return artwork.clip;
  const [x,y,width,height]=artwork.viewBox.split(' ').map(Number);
  return `${x},${y} ${x+width},${y} ${x+width},${y+height} ${x},${y+height}`;
}
export const POTHOLE_PATHS=['M5 3v18M19 3v18M12 3v4M12 18v3',
  'm5.8 12.1 2.7-1.1 1.6-2.1 3.4.7 1.7 1.5 3.1.5-2.1 2.6-3.4 1-2.4-1.2-2.6.4z',
  'm10.2 11.5 2.3 1.3 2.1-.6'];

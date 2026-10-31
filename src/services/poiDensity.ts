import {poiCategory} from './mapPoiPresentation';
import {rolePlaceMarkerKey,type RoleVectorMarker} from './vectorPlaceData';

export interface PoiDensityView {
  zoom:number;width:number;height:number;
  project:(coords:[number,number])=>{x:number;y:number};
  navigationMode?:boolean;showRouteServices?:boolean;selectedKey?:string;
}
/** Screen pixels keep the same clearance under rotation, tilt and either map engine. */
export function poiDensity(zoom:number,width:number,height:number){
  const [size,gap,maximum]=zoom<11?[26,120,8]:zoom<13?[28,100,12]:
    zoom<15?[30,80,20]:zoom<17?[34,60,36]:[38,48,64];
  const area=Math.max(0,width)*Math.max(0,height);
  return {size,gap,limit:Math.max(0,Math.min(maximum,Math.floor(area/(gap*gap*2))))};
}
const importance:Record<string,number>={
  landmark:90,historic:90,nature_reserve:90,scenic_road:90,waterfall:85,viewpoint:85,
  museum:80,park:75,beach:75,theatre:65,trail:65,attraction:60,
  toll:45,fuel:35,square:35,shopping:30,other:25,restaurant:25,cafe:25,hotel:25,inn:25,supermarket:25
};
/** A deterministic selection, never clusters displaced from their real coordinates.
 * Paid highlighting and names do not affect rank. The user's selected pin stays. */
export function selectVisiblePois(entries:readonly RoleVectorMarker[],view:PoiDensityView){
  const layout=poiDensity(view.zoom,view.width,view.height),keys=new Set<string>();
  if(!Number.isFinite(view.zoom)||!Number.isFinite(view.width)||!Number.isFinite(view.height)||!layout.limit)return {...layout,keys};
  const candidates=entries.flatMap(entry=>{
    const point=view.project(entry.coords);
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>view.width||point.y>view.height)return [];
    const key=rolePlaceMarkerKey(entry),category=poiCategory(entry);
    let rank=importance[category]??25;
    if(view.navigationMode&&(entry.kind==='fuel'||entry.kind==='toll'))rank+=60;
    if((view.showRouteServices||view.navigationMode)&&entry.routeService)rank+=100;
    if(key===view.selectedKey)rank+=10000;
    return [{key,point,rank}];
  }).sort((a,b)=>b.rank-a.rank||(a.key<b.key?-1:a.key>b.key?1:0));
  const cells=new Map<string,{x:number;y:number}[]>();
  for(const candidate of candidates){
    const {point,key}=candidate,x=Math.floor(point.x/layout.gap),y=Math.floor(point.y/layout.gap);
    let overlaps=false;
    for(let dx=-1;dx<=1&&!overlaps;dx++)for(let dy=-1;dy<=1&&!overlaps;dy++)
      overlaps=(cells.get(`${x+dx}:${y+dy}`)||[]).some(other=>Math.hypot(point.x-other.x,point.y-other.y)<layout.gap);
    if(overlaps)continue;
    keys.add(key);const cell=`${x}:${y}`;cells.set(cell,[...(cells.get(cell)||[]),point]);
    if(keys.size>=layout.limit)break;
  }
  return {...layout,keys};
}

export type EditPoint=[number,number]; // latitude, longitude
type Pixel={x:number;y:number};
const valid=(p:EditPoint)=>p?.length===2&&p.every(Number.isFinite)&&
  Math.abs(p[0])<=90&&Math.abs(p[1])<=180;

/** A tap selects a real segment only within the touch radius. Never turn a
 * tap elsewhere on the map into a new route point. Called on clicks, not GPS. */
export function routeEditPoint(tap:Pixel,paths:readonly (readonly EditPoint[])[],
  project:(point:EditPoint)=>Pixel,tolerancePx=14):EditPoint|null{
  if(!Number.isFinite(tap.x)||!Number.isFinite(tap.y))return null;
  let nearest=Math.max(0,tolerancePx)**2,selected:EditPoint|null=null;
  for(const path of paths){
    let previous:{coords:EditPoint;pixel:Pixel}|null=null;
    for(const coords of path){
      if(!valid(coords)){previous=null;continue;}
      const pixel=project(coords);
      if(!Number.isFinite(pixel.x)||!Number.isFinite(pixel.y)){previous=null;continue;}
      if(previous){
        const a=previous.pixel,dx=pixel.x-a.x,dy=pixel.y-a.y;
        const length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,((tap.x-a.x)*dx+(tap.y-a.y)*dy)/length)):0;
        const distance=(tap.x-a.x-t*dx)**2+(tap.y-a.y-t*dy)**2;
        if(distance<=nearest){
          nearest=distance;
          selected=[previous.coords[0]+t*(coords[0]-previous.coords[0]),
            previous.coords[1]+t*(coords[1]-previous.coords[1])];
        }
      }
      previous={coords,pixel};
    }
  }
  return selected;
}

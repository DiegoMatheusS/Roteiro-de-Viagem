import {projectRouteProgress} from './routeProgress';
import {validGpsHeading,shortestHeadingTransition} from './gpsHeading';
import type {CameraPoint} from './mapCameraController';

/** Driving direction comes from the verified road geometry, not how the phone
 * is held. Outside the route corridor use real movement course until rerouting;
 * never force a vehicle onto an unrelated road or invent a street direction. */
export function navigationRoadHeading(path:CameraPoint[]|undefined,position:CameraPoint,
  gpsHeading:number|null|undefined,speed:number|null|undefined,accuracy=12,travelledKm=0,totalKm=0):number|null{
  const course=validGpsHeading(gpsHeading,speed);
  if(!path||path.length<2)return course;
  // Heading changes at the street corner itself. The wider progress-painting
  // tolerance would otherwise keep the previous street for another 20 m.
  const projection=projectRouteProgress(path,position,travelledKm,totalKm,
    {parallelToleranceMeters:2,progressWeightMeters:10});
  if(!projection)return course;
  const [lat,lon]=position;
  const offset=Math.hypot((lat-projection.projected[0])*111195,
    (lon-projection.projected[1])*111195*Math.cos(lat*Math.PI/180));
  const corridor=Math.max(15,Math.min(35,(Number.isFinite(accuracy)?accuracy:12)+10));
  if(offset>corridor)return course;
  let index=projection.segmentStart;
  // Routing responses can repeat a vertex at a maneuver. Find a real segment.
  while(index<path.length-2&&path[index][0]===path[index+1][0]&&path[index][1]===path[index+1][1])index++;
  const a=path[index],b=path[index+1];
  const north=b[0]-a[0],east=(b[1]-a[1])*Math.cos(lat*Math.PI/180);
  if(!Number.isFinite(north)||!Number.isFinite(east)||Math.hypot(north,east)<1e-10)return course;
  let bearing=(Math.atan2(east,north)*180/Math.PI+360)%360;
  // An actual turnaround must point along the same street in the direction
  // being driven, even before a replacement itinerary reaches the map.
  if(course!==null&&Math.abs(shortestHeadingTransition(bearing,course)-bearing)>110)bearing=(bearing+180)%360;
  return bearing;
}

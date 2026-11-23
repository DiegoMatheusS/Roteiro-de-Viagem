import type {CameraPoint} from './mapCameraController';
import {shortestHeadingTransition,validGpsHeading} from './gpsHeading';
import {navigationRoadHeading} from './navigationRoadHeading';

export interface GpsDisplayInput {
  position?:CameraPoint;
  timestamp?:number;
  headingDegrees?:number|null;
  speedMetersPerSecond?:number|null;
  accuracyMeters?:number;
  routePath?:CameraPoint[];
  travelledKm?:number;
  totalKm?:number;
  enabled:boolean;
  reducedMotion:boolean;
}
export interface GpsDisplayFrame {
  position?:CameraPoint;
  target?:CameraPoint;
  headingDegrees?:number;
  targetHeadingDegrees?:number;
  /** Remaining time to the last real fix, shared with the camera. */
  durationMs:number;
}
export interface GpsFrameClock {
  now():number;
  request(callback:()=>void):number;
  cancel(id:number):void;
}
const valid=(point?:CameraPoint):point is CameraPoint=>Boolean(point&&point.length===2&&
  point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180);
const same=(a?:CameraPoint,b?:CameraPoint)=>a?.[0]===b?.[0]&&a?.[1]===b?.[1];
const normalized=(angle:number)=>(angle%360+360)%360;
const headingDifference=(a:number,b:number)=>Math.abs(shortestHeadingTransition(a,b)-a);
const distance=(a:CameraPoint,b:CameraPoint)=>Math.hypot((a[0]-b[0])*111320,
  (a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
const pointsToward=(angle:number,next:number,previous:number)=>
  headingDifference(angle,next)<=45&&headingDifference(angle,next)<headingDifference(angle,previous);

function confirmsTurn(origin:CameraPoint,position:CameraPoint,next:number,previous:number,input:GpsDisplayInput){
  const north=(position[0]-origin[0])*111320;
  const east=(position[1]-origin[1])*111320*Math.cos(origin[0]*Math.PI/180);
  const course=validGpsHeading(input.headingDegrees,input.speedMetersPerSecond);
  const accuracy=Number.isFinite(input.accuracyMeters)?input.accuracyMeters!:12;
  const agreesWithCourse=course!==null&&pointsToward(course,next,previous);
  const minimumMeters=agreesWithCourse?2:Math.max(6,Math.min(24,accuracy*1.5));
  if(Math.hypot(north,east)<minimumMeters)return false;
  const displacementHeading=normalized(Math.atan2(east,north)*180/Math.PI);
  // A fix spanning a corner can move diagonally while the reported course
  // already points along the new street.
  return agreesWithCourse?headingDifference(displacementHeading,next)<=65:
    pointsToward(displacementHeading,next,previous);
}

/** Presentation only: interpolate received positions and road directions,
 * never extrapolate. Raw GPS still owns guidance, distance, speed and sharing.
 * Compass/React updates of the same fix cannot restart a trajectory. */
export function createGpsDisplayMotion(paint:(point:CameraPoint,heading?:number)=>void,
  clock:GpsFrameClock={now:()=>performance.now(),request:callback=>requestAnimationFrame(callback),cancel:id=>cancelAnimationFrame(id)}){
  let from:CameraPoint|undefined,target:CameraPoint|undefined,raw:CameraPoint|undefined;
  let fromHeading:number|undefined,targetHeading:number|undefined;
  let lastPath:CameraPoint[]|undefined;
  let startedAt=0,duration=0,receivedAt:number|undefined,sampleTime:number|undefined;
  let stationaryAnchor:CameraPoint|undefined;
  let pendingTurn:{heading:number;origin:CameraPoint}|undefined;
  let frame:number|null=null,destroyed=false;
  let hidden=typeof document!=='undefined'&&document.hidden;
  const cancel=()=>{if(frame!==null)clock.cancel(frame);frame=null;};
  const snapshot=():GpsDisplayFrame=>{
    if(!from||!target)return {durationMs:0};
    const remaining=Math.max(0,startedAt+duration-clock.now());
    const fraction=duration>0?Math.min(1,Math.max(0,1-remaining/duration)):1;
    return {position:[from[0]+(target[0]-from[0])*fraction,from[1]+(target[1]-from[1])*fraction],
      target:[...target],durationMs:remaining,
      ...(fromHeading!==undefined&&targetHeading!==undefined?{
        headingDegrees:normalized(fromHeading+(targetHeading-fromHeading)*fraction),
        targetHeadingDegrees:normalized(targetHeading)}:{})};
  };
  const tick=()=>{
    frame=null;
    if(destroyed||hidden)return;
    const state=snapshot();
    if(state.position)paint(state.position,state.headingDegrees);
    if(state.durationMs>0)frame=clock.request(tick);
  };
  const clear=()=>{
    cancel();from=target=raw=stationaryAnchor=undefined;
    fromHeading=targetHeading=undefined;lastPath=undefined;pendingTurn=undefined;
    receivedAt=sampleTime=undefined;duration=0;
  };
  const visibility=()=>{hidden=document.hidden;clear();};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',visibility);
  return {
    snapshot,
    update(input:GpsDisplayInput):GpsDisplayFrame{
      if(destroyed)return {durationMs:0};
      const point=input.position;
      if(!valid(point)||hidden){clear();return {durationMs:0};}
      const now=clock.now();
      const timestamp=Number.isFinite(input.timestamp)?input.timestamp:undefined;
      const duplicate=raw&&(timestamp!==undefined&&sampleTime!==undefined
        ?timestamp===sampleTime:same(raw,point));
      if(timestamp!==undefined&&sampleTime!==undefined&&timestamp<sampleTime)return snapshot();
      const routeChanged=input.routePath!==lastPath;
      if(duplicate&&input.enabled&&!input.reducedMotion&&!routeChanged)return snapshot();
      const previous=snapshot();
      const elapsed=receivedAt===undefined?1000:now-receivedAt;
      const interval=timestamp!==undefined&&sampleTime!==undefined?timestamp-sampleTime:elapsed;
      const cadence=Math.max(250,Math.min(2000,interval>0?interval:1000));
      // A slow car or a person walking still moves. The 1.4 m/s threshold is
      // useful for noisy GPS heading, but must not freeze displayed positions.
      const stopped=input.speedMetersPerSecond!=null&&Number.isFinite(input.speedMetersPerSecond)&&input.speedMetersPerSecond<0.5;
      const jitterRadius=Math.max(12,Math.min(35,input.accuracyMeters??12));
      const ignoreJitter=stopped&&stationaryAnchor&&distance(stationaryAnchor,point)<=jitterRadius;
      if(!stopped)stationaryAnchor=undefined;
      else if(!ignoreJitter)stationaryAnchor=[...point];
      const previousFix=raw;
      raw=[...point];receivedAt=now;sampleTime=timestamp;lastPath=input.routePath;
      if(ignoreJitter&&input.enabled&&!input.reducedMotion&&!routeChanged)return snapshot();
      const next=ignoreJitter?stationaryAnchor!:point;
      const roadHeading=input.enabled?navigationRoadHeading(input.routePath,next,input.headingDegrees,
        input.speedMetersPerSecond,input.accuracyMeters,input.travelledKm,input.totalKm):null;
      const disconnected=elapsed>4000||interval>4000;
      const jump=previous.position&&distance(previous.position,next)>
        Math.max(100,Math.max(0,input.speedMetersPerSecond??0)*3);
      const previousHeading=previous.targetHeadingDegrees;
      let heading=roadHeading??previousHeading;
      if(previousHeading!==undefined&&roadHeading!==null&&headingDifference(previousHeading,roadHeading)>=15){
        heading=previousHeading;
        if(previousFix&&!duplicate&&!stopped&&!disconnected&&!jump){
          // The nearest segment can be across the corner for a single noisy
          // fix. Accumulate real displacement for slow turns too.
          if(!pendingTurn||headingDifference(pendingTurn.heading,roadHeading)>30||routeChanged)
            pendingTurn={heading:roadHeading,origin:previousFix};
          if(confirmsTurn(pendingTurn.origin,next,roadHeading,previousHeading,input)){
            heading=roadHeading;
            pendingTurn=undefined;
          }
        }else if(!duplicate)pendingTurn=undefined;
      }else pendingTurn=undefined;
      if(stopped&&previousHeading!==undefined)heading=previousHeading;
      const animate=input.enabled&&!input.reducedMotion&&previous.position&&!disconnected&&!jump&&
        (!same(previous.position,next)||(heading!==undefined&&heading!==previous.headingDegrees));
      cancel();from=animate?previous.position:[...next];target=[...next];startedAt=now;
      fromHeading=animate?previous.headingDegrees??heading:heading;
      targetHeading=heading===undefined?undefined:shortestHeadingTransition(fromHeading??null,heading);
      duration=animate?cadence:0;
      const state=snapshot();
      if(state.position)paint(state.position,state.headingDegrees);
      if(duration>0)frame=clock.request(tick);
      return state;
    },
    destroy(){
      destroyed=true;clear();
      if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility);
    }
  };
}

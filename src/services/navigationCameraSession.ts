import type {CameraPoint,CameraPort,CameraMode} from './mapCameraController';
import {nextTurnCameraZoom} from './navigationTurnCamera';

export interface NavigationCameraInput {
  navigationMode:boolean;
  followUser:boolean;
  position?:CameraPoint;
  centerRequest:number;
  reducedMotion:boolean;
  bearing?:number;
  maneuverMeters?:number|null;
  speedMetersPerSecond?:number|null;
}

/** State shared by native MapLibre events and React GPS updates. Programmatic
 * camera moves never count as exploration; only explicit user gestures do. */
export function createNavigationCameraSession(camera:CameraPort,onMode:(mode:CameraMode)=>void){
  let exploring=false;
  let navigating=false;
  let last:CameraPoint|null=null;
  let currentFixAvailable=false;
  let centerRequest=0;
  let lastBearing:number|undefined;
  let lastReducedMotion=false;
  let manualZoom=false;
  let nearTurnZoom=false;
  const mode=(next:boolean)=>{
    if(exploring===next)return;
    exploring=next;onMode(next?'exploring':'following');
  };
  const turnZoom=(input:NavigationCameraInput,point:CameraPoint)=>{
    if(exploring||manualZoom||!input.followUser||!camera.zoomToTurn)return;
    const zoom=nextTurnCameraZoom(input.maneuverMeters,input.speedMetersPerSecond,nearTurnZoom);
    if(zoom===null)return;
    camera.zoomToTurn(point,zoom,input.reducedMotion);
    nearTurnZoom=zoom!==16;
  };
  return {
    snapshot(){
      return {mode:(exploring?'exploring':'following') as CameraMode,
        centerRequest,position:last?[...last] as CameraPoint:null};
    },
    explore(){
      if(!navigating)return;
      camera.stop();mode(true);
    },
    /** A user-chosen zoom must survive the seven-second return to GPS. */
    overrideZoom(){
      if(!navigating)return;
      manualZoom=true;nearTurnZoom=false;
    },
    /** Auto-follow after seven seconds; never use a fix removed by GPS loss.
     * Preserve MapLibre pitch and the manual zoom level. */
    resume(){
      if(!navigating || !currentFixAvailable || !last ||
        !last.every(Number.isFinite))return false;
      mode(false);
      camera.recenter(last,true,lastReducedMotion);
      return true;
    },
    update(input:NavigationCameraInput){
      navigating=input.navigationMode;
      lastReducedMotion=input.reducedMotion;
      if(!navigating){
        last=null;lastBearing=undefined;currentFixAvailable=false;
        manualZoom=false;nearTurnZoom=false;mode(false);
      }
      const point=input.position;
      currentFixAvailable=!!point&&point.every(Number.isFinite)&&
        Math.abs(point[0])<=90&&Math.abs(point[1])<=180;
      if(!currentFixAvailable||!point)return;
      if(input.centerRequest>centerRequest){
        centerRequest=input.centerRequest;mode(false);
        camera.recenter(point,navigating,input.reducedMotion);
        last=[...point];lastBearing=input.bearing;
        manualZoom=false;nearTurnZoom=false;
        return;
      }
      if(!navigating)return;
      const changed=!last || Math.abs(last[0]-point[0])+Math.abs(last[1]-point[1])>0.00004 || input.bearing!==lastBearing;
      if(!exploring){
        if(!last){camera.firstGpsFix(point);lastBearing=input.bearing;}
        else if(changed&&input.followUser){camera.follow(point,input.reducedMotion);lastBearing=input.bearing;}
        turnZoom(input,point);
      }
      last=[...point];
    }
  };
}

import type {CameraPoint,CameraPort,CameraMode} from './mapCameraController';

export interface NavigationCameraInput {
  navigationMode:boolean;
  followUser:boolean;
  position?:CameraPoint;
  centerRequest:number;
  reducedMotion:boolean;
  bearing?:number;
}

/** State shared by native MapLibre events and React GPS updates. Programmatic
 * camera moves never count as exploration; only explicit user gestures do. */
export function createNavigationCameraSession(camera:CameraPort,onMode:(mode:CameraMode)=>void){
  let exploring=false;
  let navigating=false;
  let last:CameraPoint|null=null;
  let centerRequest=0;
  let lastBearing:number|undefined;
  let lastReducedMotion=false;
  const mode=(next:boolean)=>{
    if(exploring===next)return;
    exploring=next;onMode(next?'exploring':'following');
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
    /** Auto-follow after seven seconds; preserve MapLibre pitch and current zoom. */
    resume(){
      if(!navigating || !last || !last.every(Number.isFinite))return false;
      mode(false);
      camera.recenter(last,true,lastReducedMotion);
      return true;
    },
    update(input:NavigationCameraInput){
      navigating=input.navigationMode;
      lastReducedMotion=input.reducedMotion;
      if(!navigating){last=null;lastBearing=undefined;mode(false);}
      const point=input.position;
      if(!point || !point.every(Number.isFinite) || Math.abs(point[0])>90 || Math.abs(point[1])>180)return;
      if(input.centerRequest>centerRequest){
        centerRequest=input.centerRequest;mode(false);
        camera.recenter(point,navigating,input.reducedMotion);
        last=[...point];lastBearing=input.bearing;return;
      }
      if(!navigating)return;
      const changed=!last || Math.abs(last[0]-point[0])+Math.abs(last[1]-point[1])>0.00004 || input.bearing!==lastBearing;
      if(!changed)return;
      if(!exploring){
        if(!last){camera.firstGpsFix(point);lastBearing=input.bearing;}
        else if(input.followUser){camera.follow(point,input.reducedMotion);lastBearing=input.bearing;}
      }
      last=[...point];
    }
  };
}

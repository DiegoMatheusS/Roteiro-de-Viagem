import type {CameraPoint,CameraPort,CameraMode} from './mapCameraController';

export interface NavigationCameraInput {
  navigationMode:boolean;
  followUser:boolean;
  position?:CameraPoint;
  centerRequest:number;
  reducedMotion:boolean;
}

/** State shared by native MapLibre events and React GPS updates. Programmatic
 * camera moves never count as exploration; only explicit user gestures do. */
export function createNavigationCameraSession(camera:CameraPort,onMode:(mode:CameraMode)=>void){
  let exploring=false;
  let navigating=false;
  let last:CameraPoint|null=null;
  let centerRequest=0;
  const mode=(next:boolean)=>{
    if(exploring===next)return;
    exploring=next;onMode(next?'exploring':'following');
  };
  return {
    explore(){
      if(!navigating)return;
      camera.stop();mode(true);
    },
    update(input:NavigationCameraInput){
      navigating=input.navigationMode;
      if(!navigating){last=null;mode(false);return;}
      const point=input.position;
      if(!point || !point.every(Number.isFinite) || Math.abs(point[0])>90 || Math.abs(point[1])>180)return;
      if(input.centerRequest>centerRequest){
        centerRequest=input.centerRequest;mode(false);
        camera.recenter(point,true,input.reducedMotion);
        last=[...point];return;
      }
      const changed=!last || Math.abs(last[0]-point[0])+Math.abs(last[1]-point[1])>0.00004;
      if(!changed)return;
      if(!exploring){
        if(!last)camera.firstGpsFix(point);
        else if(input.followUser)camera.follow(point,input.reducedMotion);
      }
      last=[...point];
    }
  };
}

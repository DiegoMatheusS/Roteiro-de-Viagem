/** Compare the enforced traffic direction with route geometry, never the camera's viewing angle. */
export function radarMatchesDirection(direction:number|null|undefined,a:[number,number],b:[number,number]):boolean{
  if(direction==null)return true;
  const dx=(b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360),dy=b[0]-a[0];
  if(Math.hypot(dx,dy)<1e-9)return false;
  const bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
  const difference=Math.abs((bearing-direction+540)%360-180);
  return difference<=60;
}

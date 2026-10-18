/** Playwright serializes this function into the page. Keep its body independent
 * of Node imports and compiler helpers (including inferred function names). */
export function mapScreenPoint(root:HTMLElement,target:[number,number]):{x:number;y:number}{
  const box=(root.querySelector('.maplibregl-canvas')||root).getBoundingClientRect();
  const [lat,lon]=JSON.parse(root.dataset.mapCenter!);
  const size=512*2**Number(root.dataset.mapZoom);
  const centerX=(lon+180)/360*size;
  const centerY=(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*size;
  const targetX=(target[1]+180)/360*size;
  const targetY=(1-Math.log(Math.tan(Math.PI/4+target[0]*Math.PI/360))/Math.PI)/2*size;
  return {x:box.x+box.width/2+targetX-centerX,y:box.y+box.height/2+targetY-centerY};
}

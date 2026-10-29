/** Small drops grouped around each real forecast sample. These are symbols at
 * one observed location, not extra weather coordinates or a simulated radar. */
const drops=[
  {x:3,y:3,size:1},
  {x:20,y:1,size:0.7},
  {x:30,y:15,size:0.85},
  {x:8,y:25,size:0.8},
  {x:23,y:27,size:0.7}
] as const;
const dropPath='M6 0C4.5 3 1.5 6.5 1.5 9.7a4.5 4.5 0 0 0 9 0C10.5 6.5 7.5 3 6 0Z';

/** 44px rain cluster + 36px GPS arrow + a small clear margin, in screen pixels.
 * Projection keeps the arrow clear at every zoom, bearing and camera pitch. */
export function rainDropCoversArrow(rain:{x:number;y:number},arrow?:{x:number;y:number}):boolean {
  return !!arrow&&Math.abs(rain.x-arrow.x)<48&&Math.abs(rain.y-arrow.y)<48;
}

/** Only show rain symbols where the provider forecast indicates rain. */
export function isRainForecast(point:{rainProb:number;condition:string}):boolean {
  return point.rainProb>=50||/(chuva|trovoada)/i.test(point.condition);
}

export const rainDropsSvgMarkup=`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="#0284c7" stroke="white" stroke-width="1.1" style="filter:drop-shadow(0 1px 2px #0f172a99)">${drops.map(drop=>
  `<path transform="translate(${drop.x} ${drop.y}) scale(${drop.size})" d="${dropPath}"/>`).join('')}</svg>`;

export function createRainDropsSvg():SVGSVGElement {
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 44 44');
  svg.setAttribute('width','44');svg.setAttribute('height','44');
  svg.setAttribute('fill','#0284c7');svg.setAttribute('stroke','white');
  svg.setAttribute('stroke-width','1.1');
  svg.style.filter='drop-shadow(0 1px 2px #0f172a99)';
  drops.forEach(drop=>{
    const path=document.createElementNS(ns,'path');
    path.setAttribute('transform',`translate(${drop.x} ${drop.y}) scale(${drop.size})`);
    path.setAttribute('d',dropPath);svg.append(path);
  });
  return svg;
}

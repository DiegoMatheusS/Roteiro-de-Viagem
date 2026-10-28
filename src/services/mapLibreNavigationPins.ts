import { bindMarkerPopup } from './mapMarkerPopup';
import { Marker, Popup, type Map as MapLibreMap } from 'maplibre-gl';
import { arrowHeadingStyle } from './gpsHeading';
import { setGpsMarkerState } from './gpsMarkerState';

export type RolePosition = [number,number]; // latitude, longitude
export interface NavigationPins {
  origin?: RolePosition;
  destination?: RolePosition;
  live?: RolePosition;
  liveStale?:boolean;
  headingDegrees?: number | null;
  speedMetersPerSecond?: number | null;
  originLabel: string;
  destinationLabel: string;
  navigationMode: boolean;
  roadStyle: boolean;
}

type Kind = 'origin'|'destination'|'live';
const valid=(position?:RolePosition):position is RolePosition => Boolean(
  position && position.length===2 && Number.isFinite(position[0]) &&
  Number.isFinite(position[1]) && Math.abs(position[0])<=90 && Math.abs(position[1])<=180
);

export function toNavigationLngLat([lat,lng]:RolePosition):[number,number] {
  return [lng,lat];
}

export function visibleNavigationPins(input:NavigationPins): Kind[] {
  return (['origin','destination','live'] as Kind[]).filter(kind=>{
    if(kind==='origin') return !input.navigationMode && valid(input.origin);
    return valid(kind==='destination'?input.destination:input.live);
  });
}

const drawIcon = (kind:Kind): SVGSVGElement => {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',kind==='live'?'36':'19');
  svg.setAttribute('height',kind==='live'?'36':'19');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('fill',kind==='live'?'#2563eb':'none');
  svg.setAttribute('stroke',kind==='live'?'white':'currentColor');
  svg.setAttribute('stroke-width',kind==='live'?'1.5':'2.1');
  if(kind==='live')svg.style.filter='drop-shadow(0 2px 2px #0f172a66)';
  svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',kind==='live'
    ? 'M12 2 20 21l-8-4-8 4L12 2Z'
    : kind==='origin' ? 'M12 22s8-6 8-13a8 8 0 1 0-16 0c0 7 8 13 8 13Z'
      : 'M4 3v18m2-17h13l-3 5 3 5H6');
  svg.append(path);
  return svg;
};

function elementFor(kind:Kind, label:string, roadStyle:boolean): HTMLButtonElement {
  const button=document.createElement('button');
  button.type='button';
  button.className=kind==='origin'?'map-origin-dot':kind==='destination'?'map-destination-dot':'user-live-marker';
  button.title=kind==='live'?'Sua Posição Atual (GPS)':label;
  button.setAttribute('aria-label',kind==='live'?'Sua posição atual pelo GPS':kind==='origin'?`Partida: ${label}`:`Chegada: ${label}`);
  button.style.cssText='display:flex;align-items:center;gap:5px;justify-content:center;border:2px solid white;box-shadow:0 3px 12px #0f172a45;cursor:pointer;font:600 12px Inter,system-ui,sans-serif;';
  button.style.background=kind==='origin'?'#15803d':'#2563eb';
  button.style.color='#ffffff';
  const compact=roadStyle || kind==='live';
  button.style.borderRadius=compact?'50%':'13px';
  button.style.width=compact?(kind==='live'?'33px':'24px'):'auto';
  button.style.height=compact?(kind==='live'?'33px':'24px'):'34px';
  if(!compact)button.style.padding='4px 9px';
  button.append(drawIcon(kind));
  if(!compact){
    const text=document.createElement('span');
    text.textContent=label;
    text.style.cssText='max-width:115px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
    button.append(text);
  }
  if(kind==='live'){
    button.style.background='transparent';button.style.border='0';button.style.boxShadow='none';
    button.style.borderRadius='0';button.style.width='36px';button.style.height='36px';button.style.padding='0';
  }
  for(const type of ['pointerdown','touchstart','click'] as const){
    button.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  }
  return button;
}

export interface NavigationPinController {
  update(input:NavigationPins): void;
  destroy(): void;
}

/** Markers stay mounted across GPS updates; setLngLat doesn't reset the viewport. */
export function createRoleNavigationPins(map:MapLibreMap):NavigationPinController {
  const current = new Map<Kind,{marker:Marker;element:HTMLButtonElement;label:string;roadStyle:boolean}>();
  let destroyed=false;
  let lastHeading:number|null=null;
  const drop=(kind:Kind)=>{
    const pin=current.get(kind);
    if(!pin)return;
    pin.marker.remove();
    current.delete(kind);
  };
  const upsert=(kind:Kind,position:RolePosition,label:string,roadStyle:boolean)=>{
    const existing=current.get(kind);
    if(existing && existing.label===label && existing.roadStyle===roadStyle){
      existing.marker.setLngLat(toNavigationLngLat(position));
      return;
    }
    drop(kind);
    const element=elementFor(kind,label,roadStyle);
    const popup=new Popup({offset:18,closeButton:true,closeOnClick:true})
      .setText(kind==='live'?'Sua Posição Atual (GPS)':kind==='origin'?`Partida: ${label}`:`Chegada: ${label}`);
    const marker=new Marker({element,anchor:'center',rotationAlignment:kind==='live'?'map':'viewport'})
      .setLngLat(toNavigationLngLat(position)).setPopup(popup).addTo(map);
    bindMarkerPopup(marker);
    current.set(kind,{marker,element,label,roadStyle});
  };
  return {
    update(input){
      if(destroyed)return;
      const kinds=visibleNavigationPins(input);
      for(const kind of ['origin','destination','live'] as Kind[]) {
        if(!kinds.includes(kind)){drop(kind);continue;}
        const coords=kind==='origin'?input.origin:kind==='destination'?input.destination:input.live;
        if(!coords)continue;
        upsert(kind,coords,kind==='origin'?input.originLabel:kind==='destination'?input.destinationLabel:'GPS',input.roadStyle);
      }
      const live=current.get('live');
      if(live){
        setGpsMarkerState(live.element,Boolean(input.liveStale));
        // The driver's arrow is a visual overlay during navigation. Let a pan
        // or the first finger of a pinch reach the canvas beneath it instead
        // of the marker's popup listeners swallowing touchstart/pointerdown.
        live.element.style.pointerEvents=input.navigationMode?'none':'auto';
        live.element.tabIndex=input.navigationMode?-1:0;
        const svg=live.element.querySelector('svg');
        lastHeading=arrowHeadingStyle(svg,lastHeading,input.headingDegrees,input.speedMetersPerSecond,
          window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
      }
    },
    destroy(){
      destroyed=true;
      for(const kind of [...current.keys()])drop(kind);
    }
  };
}

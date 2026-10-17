import { Marker, Popup, type Map as MapLibreMap } from 'maplibre-gl';
import type { RouteStop, MeetingPoint, ConvoyParticipant } from '../types';
import { mapContributionIcon } from '../components/mapContributionIcon';

type Coords=[number,number]; // lat,lon; MapLibre expects lon,lat
export interface TripPinsActions {
  openFuel:(id:string,section:'prices'|'comments')=>void;
}
export interface TripPinsController {
  updateStops(stops:readonly RouteStop[]):void;
  updateMeetings(meetings:readonly MeetingPoint[]):void;
  updateParticipants(people:readonly ConvoyParticipant[]):void;
  destroy():void;
}
interface TrackedPin {marker:Marker;signature:string}
const positionValid=(coords:unknown):coords is Coords=>Array.isArray(coords) && coords.length===2 &&
  coords.every((n)=>typeof n==='number' && Number.isFinite(n)) &&
  Math.abs(coords[0])<=90 && Math.abs(coords[1])<=180;
export const lngLat=([lat,lon]:Coords):[number,number]=>[lon,lat];

export function selectTripStops(stops:readonly RouteStop[]):RouteStop[] {
  const ids=new Set<string>();
  return stops.filter(stop=>{
    if(!stop || !stop.id || ids.has(stop.id) || !positionValid([stop.lat,stop.lng]))return false;
    if(stop.category==='posto' && !stop.type)return false;
    ids.add(stop.id);
    return true;
  });
}
export function selectMeetingPins(points:readonly MeetingPoint[]):MeetingPoint[] {
  const ids=new Set<string>();
  return points.filter(point=>{
    if(!point || !point.id || ids.has(point.id) || !positionValid(point.coords))return false;
    ids.add(point.id);return true;
  });
}
export function selectSharingParticipants(people:readonly ConvoyParticipant[],now=Date.now()):ConvoyParticipant[] {
  const ids=new Set<string>();
  return people.filter(person=>{
    if(!person || !person.id || ids.has(person.id) || !person.isSharingLocation ||
      !positionValid(person.coords) || !person.lastLocationTimestamp)return false;
    const ts=Date.parse(person.lastLocationTimestamp),elapsed=now-ts;
    if(!Number.isFinite(ts) || elapsed>180000 || elapsed < -60000)return false;
    ids.add(person.id);return true;
  });
}

const paths={
  stop:'M12 22s8-6 8-13a8 8 0 1 0-16 0c0 7 8 13 8 13Z',
  meet:'M4 3v18m2-17h13l-3 5 3 5H6',
  person:'M12 2 20 21l-8-4-8 4L12 2Z'
};
function glyph(kind:keyof typeof paths):SVGSVGElement {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');
  svg.setAttribute('height','18');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2.1');
  svg.setAttribute('stroke-linejoin','round');svg.setAttribute('stroke-linecap','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
function labelButton(cls:string,label:string,kind:keyof typeof paths,color:string,
  badge?:string):HTMLButtonElement {
  const el=document.createElement('button');
  el.type='button';el.className=cls;el.title=label;
  el.setAttribute('aria-label',label);
  el.style.cssText='display:flex;gap:5px;align-items:center;max-width:180px;min-height:29px;border:2px solid #fff;border-radius:14px;padding:3px 9px;color:#fff;font:600 11px Inter,system-ui,sans-serif;box-shadow:0 3px 10px #0f172a45;white-space:nowrap;cursor:pointer;';
  el.style.backgroundColor=color;
  el.append(glyph(kind));
  const name=document.createElement('span');name.style.cssText='max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  name.textContent=label;el.append(name);
  if(badge){const note=document.createElement('span');note.style.cssText='font-size:9px;white-space:nowrap;opacity:.9;';note.textContent=badge;el.append(note);}
  for(const type of ['click','mousedown','dblclick','touchstart','pointerdown'] as const){
    el.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  }
  return el;
}
function popup(lines:string[]):HTMLElement {
  const box=document.createElement('div');
  box.style.cssText='max-width:240px;display:grid;gap:5px;font:13px Inter,system-ui,sans-serif;';
  for(let i=0;i<lines.length;i++){
    const text=document.createElement(i===0?'strong':'span');
    text.textContent=lines[i];box.append(text);
  }
  return box;
}
const fuelFromStop=(stop:RouteStop):string|null=>{
  if(stop.category!=='posto')return null;
  const match=stop.sourceUrl?.match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/);
  return match?`osm:${match[1]}:${match[2]}`:null;
};

/** Incremental DOM markers. Marker coordinates can change without changing camera or other pins. */
export function createRoleTripPins(map:MapLibreMap,actions:TripPinsActions):TripPinsController {
  const sets={stops:new Map<string,TrackedPin>(),meetings:new Map<string,TrackedPin>(),people:new Map<string,TrackedPin>()};
  let disposed=false;
  const reconcile=<T extends {id:string}>(list:readonly T[],group:Map<string,TrackedPin>,
    signature:(entry:T)=>string,coords:(entry:T)=>Coords,create:(entry:T)=>Marker)=>{
    if(disposed)return;
    const keep=new Set(list.map(item=>item.id));
    for(const [id,record] of group)if(!keep.has(id)){record.marker.remove();group.delete(id);}
    for(const item of list){
      const sig=signature(item),record=group.get(item.id);
      if(record && record.signature===sig){
        record.marker.setLngLat(lngLat(coords(item)));
        continue;
      }
      if(record){record.marker.remove();group.delete(item.id);}
      const marker=create(item);
      group.set(item.id,{marker,signature:sig});
    }
  };
  const makeStop=(stop:RouteStop):Marker=>{
    const fuelId=fuelFromStop(stop);
    let element:HTMLElement;
    if(fuelId){
      const icon=mapContributionIcon({className:'custom-stop-marker',
        name:stop.name,emoji:'⛽',color:'#047857',
        onPrices:()=>actions.openFuel(fuelId,'prices'),
        onComments:()=>actions.openFuel(fuelId,'comments')});
      const root=document.createElement('div');
      root.className='custom-stop-marker';root.title=stop.name;
      root.tabIndex=0;root.setAttribute('role','button');root.setAttribute('aria-label',`Ver preços de ${stop.name}`);
      const html=icon.options.html;
      if(html instanceof HTMLElement)root.append(html); // no untrusted HTML interpretation
      root.addEventListener('click',event=>{event.stopPropagation();if(!(event.target as HTMLElement).closest('button'))actions.openFuel(fuelId,'prices');});
      root.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();actions.openFuel(fuelId,'prices');}});
      for(const type of ['mousedown','pointerdown','touchstart'] as const)root.addEventListener(type,event=>event.stopPropagation(),{passive:true});
      element=root;
    }else{
      const color=stop.category==='mirante'||stop.category==='parque'?'#047857':
        stop.category==='restaurante'?'#c2410c':'#0369a1';
      element=labelButton('custom-stop-marker',stop.name,'stop',color);
    }
    const details=popup([stop.name,stop.description||'Parada no roteiro',
      `Parada recomendada: ${stop.recommendedMinutes} min`]);
    return new Marker({element,anchor:'center'})
      .setLngLat([stop.lng,stop.lat])
      .setPopup(new Popup({offset:18}).setDOMContent(details)).addTo(map);
  };
  const makeMeeting=(meeting:MeetingPoint):Marker=>{
    const arrived=meeting.confirmedArrivedParticipantIds?.length||0;
    const color=meeting.category==='minha_escolha'?'#2563eb':'#0284c7';
    const label=meeting.title;
    const element=labelButton('meeting-point-marker',label,'meet',color,`${arrived} no local`);
    const address=[meeting.street&&[meeting.street,meeting.number].filter(Boolean).join(', '),
      meeting.neighborhood,meeting.city,meeting.cep&&`CEP ${meeting.cep}`]
      .filter(Boolean).join(' · ');
    const details=popup([`Ponto de encontro: ${label}`,...(address?[address]:[]),
      meeting.description||'Ponto de parada e reagrupamento do comboio.',
      arrived?`${arrived} participante(s) confirmaram chegada`:'Nenhum participante chegou ainda']);
    return new Marker({element,anchor:'center'})
      .setLngLat(lngLat(meeting.coords))
      .setPopup(new Popup({offset:18}).setDOMContent(details)).addTo(map);
  };
  const makeParticipant=(person:ConvoyParticipant):Marker=>{
    const color=person.isStale?'#64748b':person.isOrganizer?'#dc2626':'#2563eb';
    const shortName=person.name.split(' ')[0]||'Viajante';
    const element=labelButton('convoy-participant-marker',shortName,'person',color,
      person.isStale?'Sinal antigo':undefined);
    element.title=person.name;element.setAttribute('aria-label',person.name);
    return new Marker({element,anchor:'center'})
      .setLngLat(lngLat(person.coords!))
      .addTo(map);
  };
  return {
    updateStops(stops){
      reconcile(selectTripStops(stops),sets.stops,
        stop=>JSON.stringify([stop.name,stop.category,stop.description,stop.recommendedMinutes,stop.sourceUrl,stop.type]),
        stop=>[stop.lat,stop.lng],makeStop);
    },
    updateMeetings(meetings){
      reconcile(selectMeetingPins(meetings),sets.meetings,
        point=>JSON.stringify([point.title,point.category,point.description,point.street,point.number,point.neighborhood,point.city,point.cep,point.confirmedArrivedParticipantIds]),
        point=>point.coords,makeMeeting);
    },
    updateParticipants(people){
      reconcile(selectSharingParticipants(people),sets.people,
        person=>JSON.stringify([person.name,person.vehicleType,person.isOrganizer,person.isStale]),
        person=>person.coords!,makeParticipant);
    },
    destroy(){
      disposed=true;
      for(const group of Object.values(sets)){
        for(const record of group.values())record.marker.remove();
        group.clear();
      }
    }
  };
}

import { bindMarkerPopup } from './mapMarkerPopup';
import {Marker,Popup,type Map as MapLibreMap} from 'maplibre-gl';
import type {WeatherPoint} from '../types';
import {visibleWeatherSamples,weatherPointKey,weatherDisplayLines} from './vectorWeatherData';

interface TrackedForecast { marker:Marker; signature:string; }
export interface WeatherPinController {
  update(samples:readonly WeatherPoint[],show:boolean):void;
  destroy():void;
}
function pointElement(point:WeatherPoint):HTMLButtonElement {
  const button=document.createElement('button');
  button.type='button';
  button.className='weather-forecast-marker rdv-maplibre-forecast';
  button.setAttribute('aria-label',`Ver previsão do tempo em ${point.locationName}`);
  button.title=`Previsão em ${point.locationName}`;
  button.style.cssText='display:grid;place-items:center;width:31px;height:31px;padding:0;border:2px solid white;border-radius:50%;box-shadow:0 3px 10px #0f172a50;cursor:pointer;color:white;';
  button.style.background=point.rainProb>=50?'#0284c7':'#475569';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('width','19');svg.setAttribute('height','19');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');
  svg.setAttribute('stroke-linejoin','round');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d','M12 3c-2.5 4-7 9-7 13a7 7 0 0 0 14 0c0-4-4.5-9-7-13Z');
  svg.append(path);button.append(svg);
  // Keep popup click, but do not select a map destination underneath the marker.
  for(const type of ['click','dblclick','mousedown','pointerdown','touchstart'] as const){
    button.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  }
  return button;
}
function popupContent(point:WeatherPoint):HTMLDivElement {
  const root=document.createElement('div');
  root.style.cssText='display:grid;gap:5px;max-width:230px;font:12px Inter,system-ui,sans-serif;line-height:1.4;';
  weatherDisplayLines(point).forEach((line,index)=>{
    const item=document.createElement(index===0?'strong':'span');
    item.textContent=line;
    if(index===0)item.style.fontSize='13px';
    root.append(item);
  });
  return root;
}
export function createRoleWeatherPins(gl:MapLibreMap):WeatherPinController {
  const current=new Map<string,TrackedForecast>();
  let destroyed=false;
  const remove=(key:string)=>{
    const item=current.get(key);
    if(!item)return;
    item.marker.remove();current.delete(key);
  };
  const create=(point:WeatherPoint)=>{
    const marker=new Marker({element:pointElement(point),anchor:'center'})
      .setLngLat([point.coords![1],point.coords![0]])
      .setPopup(new Popup({offset:20,closeButton:true}).setDOMContent(popupContent(point)))
      .addTo(gl);
    return bindMarkerPopup(marker);
  };
  return {
    update(samples,show){
      if(destroyed)return;
      const visible=show?visibleWeatherSamples(samples):[];
      const desired=new Set(visible.map(weatherPointKey));
      for(const key of [...current.keys()])if(!desired.has(key))remove(key);
      for(const point of visible){
        const key=weatherPointKey(point);
        const signature=JSON.stringify([point.condition,point.tempC,point.rainProb,point.windKmH,
          point.windDirectionDegrees,point.warning,point.forecastAt,point.passTime]);
        const previous=current.get(key);
        if(previous && previous.signature===signature){
          previous.marker.setLngLat([point.coords![1],point.coords![0]]);
          continue;
        }
        remove(key);
        const marker=create(point);
        current.set(key,{marker,signature});
      }
    },
    destroy(){
      destroyed=true;
      for(const key of [...current.keys()])remove(key);
    }
  };
}

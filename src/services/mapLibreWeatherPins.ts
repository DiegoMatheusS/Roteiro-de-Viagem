import { bindMarkerPopup } from './mapMarkerPopup';
import {Marker,Popup,type Map as MapLibreMap} from 'maplibre-gl';
import type {WeatherPoint} from '../types';
import {visibleRainSamples,weatherPointKey,weatherDisplayLines} from './vectorWeatherData';
import {createRainDropsSvg} from './rainDropMarkers';

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
  button.style.cssText='display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;cursor:pointer;';
  button.append(createRainDropsSvg());
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
      const visible=show?visibleRainSamples(samples):[];
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

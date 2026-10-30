import type {Place} from '../types/admin';
import type {FuelPrice,FuelStation} from '../types/fuel';
import type {PlaceRatingSummary} from '../types/placeFeedback';
import type {RoleVectorMarker} from './vectorPlaceData';
import {fuelApi} from './fuelApi';
import {PLACE_KINDS} from '../types/admin';
import {placeIconKind} from './placeIconKind';
import {fuelBalloonRows} from './mapPriceLabels';
import '../role-place-balloon.css';

export interface RoleMarkerActions {
  onStation:(id:string,section:'prices'|'comments',mode?:'view'|'edit')=>void;
  onToll:(id:string,section:'prices'|'comments',place:Place|null)=>void;
  onPlace:(id:string)=>void;
  onReport:(entry:RoleVectorMarker)=>void;
}
export const placeBalloonSignature=(entry:RoleVectorMarker)=>JSON.stringify(entry);
const starPath='m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9L12 2.5Z';
export function createRatingStars(summary:PlaceRatingSummary):HTMLElement{
  const row=document.createElement('div');row.className='role-place-rating';
  const average=summary.count>0&&Number.isFinite(summary.average)?Math.max(0,Math.min(5,summary.average!)):null;
  row.setAttribute('role','img');
  row.setAttribute('aria-label',average===null?'Sem avaliações':`Avaliação ${average.toFixed(1).replace('.',',')} de 5, ${summary.count} avaliações`);
  const stars=document.createElement('span');stars.className='role-place-stars';stars.setAttribute('aria-hidden','true');
  for(let i=0;i<5;i++){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');
    const empty=document.createElementNS(svg.namespaceURI,'path');empty.setAttribute('d',starPath);empty.setAttribute('class','role-star-empty');svg.append(empty);
    const fill=empty.cloneNode() as SVGPathElement;fill.setAttribute('class','role-star-filled');
    const fraction=Math.max(0,Math.min(1,(average??0)-i));
    fill.style.clipPath=`inset(0 ${100-fraction*100}% 0 0)`;svg.append(fill);stars.append(svg);
  }
  const text=document.createElement('span');text.textContent=average===null?'Sem avaliações':`${average.toFixed(1).replace('.',',')} (${summary.count})`;
  row.append(stars,text);return row;
}

/** One selected, coordinate-anchored balloon. No user content is parsed as HTML. */
export function createPlaceBalloon(entry:RoleVectorMarker,actions:RoleMarkerActions,close:()=>void){
  const abort=new AbortController();let disposed=false;
  const element=document.createElement('section');element.className='role-place-balloon';
  element.setAttribute('aria-label',`Detalhes de ${entry.name}`);
  const rating=document.createElement('div');rating.append(createRatingStars({average:null,count:0}));
  const details=()=>{close();if(entry.kind==='fuel')actions.onStation(entry.id,'prices');
    else if(entry.kind==='toll')actions.onToll(entry.id,'prices',entry.place);else actions.onPlace(entry.id);};
  const heading=document.createElement('button');heading.type='button';heading.className='role-place-balloon-name';
  heading.setAttribute('aria-label',`Ver detalhes de ${entry.name}`);heading.textContent=entry.name;heading.addEventListener('click',details);
  element.append(rating,heading);
  const priceList=document.createElement('dl');priceList.className='role-place-balloon-prices';
  const renderPrices=(prices:readonly FuelPrice[],state:'ready'|'loading'|'error'='ready')=>{
    priceList.replaceChildren();
    for(const row of fuelBalloonRows(prices)){
      const wrap=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');
      label.textContent=row.label;value.textContent=row.value??(state==='loading'?'…':state==='error'?'Indisponível':'Não informado');
      wrap.append(label,value);priceList.append(wrap);
    }
  };
  if(entry.kind==='fuel'){
    renderPrices(entry.prices??[],'loading');element.append(priceList);
    void fuelApi<FuelStation>(`/stations/${encodeURIComponent(entry.id)}`,{signal:abort.signal}).then(station=>{
      if(!disposed)renderPrices(Array.isArray(station.prices)?station.prices:[]);
    }).catch(()=>{if(!disposed)renderPrices(entry.prices??[],'error');});
  }else{
    const category=document.createElement('p');category.className='role-place-balloon-category';
    category.textContent=entry.kind==='toll'?(entry.priceLabel||'Tarifa não informada'):
      PLACE_KINDS.find(kind=>kind.id===placeIconKind(entry.category,entry.name))?.label||'Estabelecimento';element.append(category);
  }
  void fuelApi<PlaceRatingSummary>(`/places/${encodeURIComponent(entry.id)}/feedback`,{signal:abort.signal}).then(summary=>{
    if(!disposed)rating.replaceChildren(createRatingStars(summary));
  }).catch(()=>{
    if(disposed)return;
    rating.replaceChildren();const status=document.createElement('span');status.className='role-place-rating';
    status.textContent='Avaliações indisponíveis';rating.append(status);
  });
  const footer=document.createElement('div');footer.className='role-place-balloon-actions';
  const contribute=document.createElement('button');contribute.type='button';
  contribute.textContent=entry.kind==='fuel'?'Indicar preço':entry.kind==='toll'?'Indicar tarifa':'Ver detalhes';
  contribute.addEventListener('click',()=>{close();if(entry.kind==='fuel')actions.onStation(entry.id,'prices','edit');
    else if(entry.kind==='toll')actions.onToll(entry.id,'prices',entry.place);else actions.onPlace(entry.id);});
  const info=document.createElement('button');info.type='button';info.className='role-place-balloon-info';
  info.setAttribute('aria-label','Avaliar ou informar problema no estabelecimento');
  const glyph=document.createElement('span');glyph.setAttribute('aria-hidden','true');glyph.textContent='i';info.append(glyph);
  info.addEventListener('click',()=>{close();actions.onReport(entry);});footer.append(contribute,info);element.append(footer);
  for(const type of ['click','dblclick','pointerdown','mousedown','touchstart','wheel'] as const)
    element.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  return {element,dispose(){disposed=true;abort.abort();}};
}

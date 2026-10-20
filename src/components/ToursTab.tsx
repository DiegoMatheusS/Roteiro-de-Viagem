import {useMemo,useRef,useState} from 'react';
import {Bookmark,Check,ChevronRight,Compass,LocateFixed,Mic,Route,Search,Trees,X} from 'lucide-react';
import type {TripPlan,Vehicle} from '../types';
import type {Place} from '../types/admin';
import {TOURIST_PLACE_KINDS} from '../types/admin';
import {useDeviceLocation} from '../hooks/useDeviceLocation';
import {useNearbyPlaces} from '../hooks/useNearbyPlaces';
import {useGpsPermissionAction} from '../hooks/useGpsPermissionAction';
import {InteractiveMap} from './InteractiveMap';
import {TripPreviewScreen} from './TripPreviewScreen';
import {fetchRouteChoices,choiceToTrip} from '../services/routeChoices';
import {GUEST_NAVIGATION_VEHICLE} from '../services/guestNavigationVehicle';
import ibirapueraPhoto from '../assets/figma-ibirapuera.svg';
import romeirosPhoto from '../assets/figma-romeiros.svg';
import '../role-explore-figma.css';

type Coords=[number,number];
type ExploreFilter='near'|'nature'|'road';
type ExplorePlace={id:string;name:string;coords:Coords;kind:string;address:string;category:string;photo:string;city:string;curated?:boolean};
interface ToursTabProps {
  currentVehicle:Vehicle|null;
  onStartTrip:(trip:TripPlan)=>void;
  onSaveTrip:(trip:TripPlan)=>void;
  savedTripIds:string[];
}
const natureKinds=new Set<string>(['park','waterfall','nature_reserve','trail','beach','viewpoint']);
const roadKinds=new Set<string>(['viewpoint','historic','landmark','scenic_road']);
const touristKinds=new Set<string>(TOURIST_PLACE_KINDS);
const saoPauloExamples:ExplorePlace[]=[
  {id:'figma-ibirapuera',name:'Volta no Ibirapuera',coords:[-23.5874,-46.6576],
    kind:'park',address:'Parque Ibirapuera',category:'Urbano',photo:ibirapueraPhoto,city:'São Paulo',curated:true},
  {id:'figma-romeiros',name:'Estrada dos Romeiros',coords:[-23.457,-46.873],
    kind:'viewpoint',address:'Trecho próximo a Barueri, SP',category:'Estrada',photo:romeirosPhoto,city:'Barueri',curated:true}
];
function haversineKm(from:Coords,to:Coords){
  const rad=Math.PI/180;
  const dLat=(to[0]-from[0])*rad,dLon=(to[1]-from[1])*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(from[0]*rad)*Math.cos(to[0]*rad)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function placeCity(address:string){
  const parts=address.split(',').map(part=>part.trim()).filter(Boolean);
  return parts.length>1?parts[parts.length-2]||'':parts[0]||'';
}
function isSaoPauloArea(coords:Coords) {
  return coords[0]>-23.9&&coords[0]<-23.2&&coords[1]>-47.05&&coords[1]<-46.2;
}
function sourceToExplore(place:Place):ExplorePlace{
  const category=['scenic_road','viewpoint','trail'].includes(place.kind)?'Estrada':
    ['museum','theatre','historic','landmark'].includes(place.kind)?'Cultura':
    place.kind==='park'?'Urbano':'Natureza';
  const photo=category==='Estrada'?romeirosPhoto:ibirapueraPhoto;
  return {id:place.id,name:place.name,coords:[place.lat,place.lng],kind:place.kind,
    address:place.address,category,photo,city:placeCity(place.address)};
}
export function ToursTab({currentVehicle,onStartTrip,onSaveTrip,savedTripIds}:ToursTabProps){
  const gps=useDeviceLocation(true,'role-explore-figma');
  const permission=useGpsPermissionAction(gps.retry);
  const origin=gps.status==='ready'?gps.position?.coords:undefined;
  // A aba Explorar procura destinos de passeio, não apenas os 5 km do mapa de postos.
  const places=useNearbyPlaces(origin?[origin]:[],Boolean(origin),120);
  const [filter,setFilter]=useState<ExploreFilter>('near');
  const [query,setQuery]=useState('');
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<TripPlan|null>(null);
  const [voiceError,setVoiceError]=useState('');
  const pending=useRef<AbortController|null>(null);

  const allPlaces=useMemo(()=>{
    const fromApi=places.filter(p=>p.active&&touristKinds.has(p.kind) &&
      Number.isFinite(p.lat)&&Number.isFinite(p.lng) &&
      Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180).map(sourceToExplore);
    if(!origin)return fromApi;
    const nearby=fromApi.filter(p=>haversineKm(origin,p.coords)<=120);
    // As duas atrações do layout servem como sugestões editoriais, apenas na região de SP.
    // Seus dados rodoviários nunca são presumidos; a rota é calculada ao selecionar.
    const curated=isSaoPauloArea(origin)?saoPauloExamples.filter(
      suggestion=>!nearby.some(p=>p.name.toLowerCase().includes(suggestion.name.toLowerCase()))
    ):[];
    return [...nearby,...curated].sort((a,b)=>haversineKm(origin,a.coords)-haversineKm(origin,b.coords));
  },[places,origin?.[0],origin?.[1]]);
  const filtered=useMemo(()=>allPlaces.filter(place=>{
    const matchesFilter=filter==='near'||(filter==='nature'&&natureKinds.has(place.kind))||
      (filter==='road'&&(roadKinds.has(place.kind)||place.category==='Estrada'));
    const value=query.trim().toLocaleLowerCase('pt-BR');
    return matchesFilter&&(!value||[place.name,place.city,place.address,place.category].some(text=>text.toLocaleLowerCase('pt-BR').includes(value)));
  }).slice(0,12),[allPlaces,filter,query]);
  const featured=filtered[0];
  const regionLabel=origin&&isSaoPauloArea(origin)?'São Paulo, SP':origin?'Localização atual':'';
  const nearest=origin&&featured?Math.round(haversineKm(origin,featured.coords)):null;

  const loadRoute=async(place:ExplorePlace,saveOnly=false)=>{
    if(!origin){
      setError('Ative o GPS para calcular uma rota real a partir da sua localização.');
      await permission.request();return;
    }
    pending.current?.abort();
    const controller=new AbortController();
    pending.current=controller;
    setBusyId(place.id);setError('');
    try{
      const options=await fetchRouteChoices(origin,place.coords,controller.signal);
      if(controller.signal.aborted)return;
      if(!options.length)throw new Error('Nenhuma rota rodoviária encontrada para este destino.');
      const verified=choiceToTrip(options[0],currentVehicle||GUEST_NAVIGATION_VEHICLE,origin,{
        name:place.name,coords:place.coords
      });
      if(saveOnly)onSaveTrip(verified);
      else setPreview(verified);
    }catch(err){
      if(!controller.signal.aborted)setError((err as Error).message);
    }finally{
      if(pending.current===controller){pending.current=null;setBusyId(null);}
    }
  };
  const speechSearch=()=>{
    setVoiceError('');
    type Rec={lang:string;onresult:((ev:{results:{[i:number]:{[j:number]:{transcript:string}}}})=>void)|null;onerror:(()=>void)|null;start:()=>void};
    const target=window as Window&{SpeechRecognition?:new()=>Rec;webkitSpeechRecognition?:new()=>Rec};
    const Recognizer=target.SpeechRecognition||target.webkitSpeechRecognition;
    if(!Recognizer){setVoiceError('Busca por voz indisponível neste dispositivo.');return;}
    const recognition=new Recognizer();
    recognition.lang='pt-BR';
    recognition.onresult=event=>setQuery(event.results[0][0].transcript);
    recognition.onerror=()=>setVoiceError('Não foi possível ouvir a busca. Digite o destino.');
    recognition.start();
  };

  return <section className="rdv-explore-page" aria-label="Explorar passeios">
    <header className="rdv-explore-header">
      <h1>Explorar</h1>
      <p>Descubra o próximo caminho</p>
      <div className="rdv-explore-search">
        <Search size={20} strokeWidth={1.5} aria-hidden="true"/>
        <input type="search" aria-label="Buscar passeios" placeholder="Buscar passeios"
          value={query} onChange={event=>setQuery(event.target.value)}/>
        {query?<button type="button" aria-label="Limpar busca" onClick={()=>setQuery('')}><X size={19}/></button>:
          <button type="button" aria-label="Buscar por voz" onClick={speechSearch}><Mic size={19} strokeWidth={1.3}/></button>}
      </div>
      <div role="group" aria-label="Filtrar passeios" className="rdv-explore-filters">
        <button type="button" aria-pressed={filter==='near'}
          onClick={()=>setFilter('near')} className={filter==='near'?'is-selected':''}>
          <LocateFixed size={17} strokeWidth={1.7}/>Perto de mim
        </button>
        <button type="button" aria-pressed={filter==='nature'}
          onClick={()=>setFilter('nature')} className={filter==='nature'?'is-selected':''}>
          <Trees size={17} strokeWidth={1.6}/>Natureza
        </button>
        <button type="button" aria-pressed={filter==='road'}
          onClick={()=>setFilter('road')} className={filter==='road'?'is-selected':''}>Estrada</button>
      </div>
      {voiceError&&<p role="status" className="rdv-explore-search-note">{voiceError}</p>}
    </header>
    <div className="rdv-explore-map" aria-label="Mapa das redondezas">
      <InteractiveMap roadStyle initialStyle="light" userLiveCoords={origin}
        showFuelStations={false} className="w-full h-full"/>
      {nearest!==null&&<span className="rdv-explore-distance-badge"
        title="Distância aproximada em linha reta (não é um percurso calculado)">
        <Route size={16}/>{nearest} km
      </span>}
    </div>
    <div className="rdv-explore-sheet">
      <div className="rdv-explore-sheet-handle" aria-hidden="true"/>
      <div className="rdv-explore-sheet-title">
        <h2>Perto de você</h2>
        <span>{regionLabel}</span>
      </div>
      {error&&<p role="alert" className="rdv-explore-alert">{error}</p>}
      {gps.status!=='ready'&&<div className="rdv-explore-gps-hint">
        <p>Permita a localização para encontrar passeios próximos.</p>
        <button type="button" onClick={()=>void permission.request()}>Ativar GPS</button>
      </div>}
      <div className="rdv-explore-list" aria-label="Passeios encontrados">
        {filtered.map(place=>{
          const distance=origin?haversineKm(origin,place.coords):null;
          const preparing=busyId===place.id;
          return <article key={place.id} className="rdv-explore-route-row">
            <img src={place.photo} alt="Imagem ilustrativa do tipo de passeio" loading="lazy"/>
            <div className="rdv-explore-route-copy">
              <span className="rdv-explore-route-category">{place.category}</span>
              <h3>{place.name}</h3>
              <p>{place.city||place.address}{distance!==null?` · a ${Math.round(distance)} km`:''}</p>
              <button type="button" aria-label={`Ver rota para ${place.name}`}
                disabled={busyId!==null} onClick={()=>void loadRoute(place)}
                className="rdv-explore-route-cta">
                <Route size={14} strokeWidth={1.7}/>
                {preparing?'Calculando rota…':'Calcular percurso'}
                <ChevronRight size={15} className="rdv-explore-chevron"/>
              </button>
            </div>
            <button type="button" aria-label={`Salvar rota para ${place.name}`}
              title="Calcular percurso e salvar nas minhas viagens" disabled={busyId!==null}
              onClick={()=>void loadRoute(place,true)} className="rdv-explore-bookmark">
              <Bookmark size={19} strokeWidth={1.5}/>
            </button>
          </article>;
        })}
        {filtered.length===0&&<div className="rdv-explore-empty">
          <Compass size={24} strokeWidth={1.5}/>
          <strong>{query?'Nenhum passeio encontrado':'Nenhum passeio próximo cadastrado'}</strong>
          <p>{query?'Tente outro nome ou categoria.':'Novas atrações aparecerão aqui quando disponíveis nesta região.'}</p>
          {query&&<button type="button" onClick={()=>{setQuery('');setFilter('near');}}>Limpar busca</button>}
        </div>}
      </div>
    </div>
    {preview&&<TripPreviewScreen key={preview.id} trip={preview}
      vehicleType={currentVehicle?.type||'motorcycle'} isSaved={savedTripIds.includes(preview.id)}
      onClose={()=>setPreview(null)} onAdjust={()=>setPreview(null)}
      onSave={()=>onSaveTrip(preview)}
      onStart={()=>{onStartTrip(preview);setPreview(null);}}/>}
  </section>;
}

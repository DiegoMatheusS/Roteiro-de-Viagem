import {useMemo,useRef,useState} from 'react';
import {Bookmark,ChevronRight,Compass,Droplets,Flag,Landmark,LocateFixed,MapPin,Mic,Route,Search,Trees,Waves,X} from 'lucide-react';
import type {TripPlan,Vehicle} from '../types';
import type {ExploreArea,ExploreFilter,ExplorePlace} from '../types/explore';
import {EXPLORE_AREA_LABELS,exploreDistanceKm,filterExplorePlaces,mergeExplorePlaces} from '../services/explorePlaces';
import {useDeviceLocation} from '../hooks/useDeviceLocation';
import {useNearbyPlaces} from '../hooks/useNearbyPlaces';
import {useGpsPermissionAction} from '../hooks/useGpsPermissionAction';
import {InteractiveMap} from './InteractiveMap';
import {TripPreviewScreen} from './TripPreviewScreen';
import {fetchRouteChoices,choiceToTrip} from '../services/routeChoices';
import {GUEST_NAVIGATION_VEHICLE} from '../services/guestNavigationVehicle';
import '../role-explore-figma.css';

interface ToursTabProps {
  currentVehicle:Vehicle|null;
  onStartTrip:(trip:TripPlan)=>void;
  onSaveTrip:(trip:TripPlan)=>void;
  savedTripIds:string[];
}
const PAGE_SIZE=20;
const filterTitles:Record<ExploreFilter,string>={all:'Todos os passeios',near:'Perto de você',
  nature:'Natureza',culture:'Cultura',road:'Estradas',cities:'Cidades',
  waterfalls:'Cachoeiras',lakes:'Lagos',parks:'Parques',racetracks:'Autódromos'};
function isSaoPauloArea(coords:[number,number]) {
  return coords[0]>-23.9&&coords[0]<-23.2&&coords[1]>-47.05&&coords[1]<-46.2;
}
export function ToursTab({currentVehicle,onStartTrip,onSaveTrip,savedTripIds}:ToursTabProps){
  const gps=useDeviceLocation(true,'role-explore-figma');
  const permission=useGpsPermissionAction(gps.retry);
  const origin=gps.status==='ready'?gps.position?.coords:undefined;
  // A aba Explorar procura destinos de passeio, não apenas os 5 km do mapa de postos.
  const places=useNearbyPlaces(origin?[origin]:[],Boolean(origin),120);
  const [filter,setFilter]=useState<ExploreFilter>('all');
  const [area,setArea]=useState<ExploreArea>('all');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);
  const updateQuery=(value:string)=>{setQuery(value);setVisibleCount(PAGE_SIZE);};
  const updateFilter=(value:ExploreFilter)=>{setFilter(value);setVisibleCount(PAGE_SIZE);};
  const updateArea=(value:ExploreArea)=>{
    setArea(value);setVisibleCount(PAGE_SIZE);
    if(filter==='near')setFilter('all');
  };
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [preview,setPreview]=useState<TripPlan|null>(null);
  const [voiceError,setVoiceError]=useState('');
  const pending=useRef<AbortController|null>(null);

  const allPlaces=useMemo(()=>mergeExplorePlaces(places,origin),[places,origin?.[0],origin?.[1]]);
  const filtered=useMemo(()=>filterExplorePlaces(allPlaces,filter,query,origin,area),
    [allPlaces,filter,query,origin?.[0],origin?.[1],area]);
  const visible=filtered.slice(0,visibleCount);
  const featured=filtered[0];
  const regionLabel=origin&&isSaoPauloArea(origin)?'São Paulo, SP':origin?'Localização atual':'';
  const nearest=origin&&featured?Math.round(exploreDistanceKm(origin,featured.coords)):null;

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
    recognition.onresult=event=>updateQuery(event.results[0][0].transcript);
    recognition.onerror=()=>setVoiceError('Não foi possível ouvir a busca. Digite o destino.');
    recognition.start();
  };

  return <section className="rdv-explore-page" aria-label="Explorar passeios">
    <header className="rdv-explore-header">
      <div className="rdv-explore-heading">
        <h1>Explorar</h1>
        <select aria-label="Região de São Paulo" value={area}
          onChange={event=>updateArea(event.target.value as ExploreArea)}>
          {Object.entries(EXPLORE_AREA_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="rdv-explore-search">
        <Search size={20} strokeWidth={1.5} aria-hidden="true"/>
        <input type="search" aria-label="Buscar passeios" placeholder="Buscar passeios"
          value={query} onChange={event=>updateQuery(event.target.value)}/>
        {query?<button type="button" aria-label="Limpar busca" onClick={()=>updateQuery('')}><X size={19}/></button>:
          <button type="button" aria-label="Buscar por voz" onClick={speechSearch}><Mic size={19} strokeWidth={1.3}/></button>}
      </div>
      <div role="group" aria-label="Filtrar passeios" className="rdv-explore-filters">
        <button type="button" aria-pressed={filter==='all'}
          onClick={()=>updateFilter('all')} className={filter==='all'?'is-selected':''}>
          <Compass size={17} strokeWidth={1.6}/>Todos
        </button>
        <button type="button" aria-pressed={filter==='near'}
          onClick={()=>updateFilter('near')} className={filter==='near'?'is-selected':''}>
          <LocateFixed size={17} strokeWidth={1.7}/>Perto de mim
        </button>
        <button type="button" aria-pressed={filter==='nature'}
          onClick={()=>updateFilter('nature')} className={filter==='nature'?'is-selected':''}>
          <Trees size={17} strokeWidth={1.6}/>Natureza
        </button>
        <button type="button" aria-pressed={filter==='road'}
          onClick={()=>updateFilter('road')} className={filter==='road'?'is-selected':''}>Estrada</button>
        <button type="button" aria-pressed={filter==='racetracks'}
          onClick={()=>updateFilter('racetracks')} className={filter==='racetracks'?'is-selected':''}>
          <Flag size={17} strokeWidth={1.6}/>Autódromos
        </button>
        <button type="button" aria-pressed={filter==='waterfalls'}
          onClick={()=>updateFilter('waterfalls')} className={filter==='waterfalls'?'is-selected':''}>
          <Droplets size={17} strokeWidth={1.6}/>Cachoeiras
        </button>
        <button type="button" aria-pressed={filter==='lakes'}
          onClick={()=>updateFilter('lakes')} className={filter==='lakes'?'is-selected':''}>
          <Waves size={17} strokeWidth={1.6}/>Lagos
        </button>
        <button type="button" aria-pressed={filter==='parks'}
          onClick={()=>updateFilter('parks')} className={filter==='parks'?'is-selected':''}>
          <Trees size={17} strokeWidth={1.6}/>Parques
        </button>
        <button type="button" aria-pressed={filter==='culture'}
          onClick={()=>updateFilter('culture')} className={filter==='culture'?'is-selected':''}>
          <Landmark size={17} strokeWidth={1.6}/>Cultura
        </button>
        <button type="button" aria-pressed={filter==='cities'}
          onClick={()=>updateFilter('cities')} className={filter==='cities'?'is-selected':''}>
          <MapPin size={17} strokeWidth={1.6}/>Cidades
        </button>
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
        <h2>{query.trim()?'Resultados':filter==='near'&&!origin?'Passeios':filterTitles[filter]}</h2>
        <span>{filter==='near'?regionLabel:EXPLORE_AREA_LABELS[area]}</span>
      </div>
      {error&&<p role="alert" className="rdv-explore-alert">{error}</p>}
      {gps.status!=='ready'&&<div className="rdv-explore-gps-hint">
        <button type="button" onClick={()=>void permission.request()}>Ativar GPS</button>
      </div>}
      <div className="rdv-explore-list" aria-label="Passeios encontrados">
        {visible.map(place=>{
          const distance=origin?exploreDistanceKm(origin,place.coords):null;
          const preparing=busyId===place.id;
          return <article key={place.id} className="rdv-explore-route-row">
            <div className="rdv-explore-route-photo" aria-label={place.photo?'Fotografia do passeio':'Local sem fotografia verificada'}>
              <Compass size={32} strokeWidth={1.5} aria-hidden="true"/>
              {place.photo && <img src={place.photo} alt={`Fotografia de ${place.name}`}
                loading="lazy" decoding="async" width={200} height={200} referrerPolicy="no-referrer"
                onError={event=>{event.currentTarget.hidden=true;}}/>}
            </div>
            <div className="rdv-explore-route-copy">
              <span className="rdv-explore-route-category">{place.category}</span>
              {place.photoPage && place.photoCredit && <a href={place.photoPage}
                target="_blank" rel="noopener noreferrer"
                className="rdv-explore-photo-credit"
                title={`Fotografia: ${place.photoCredit}`}>
                Foto: {place.photoCredit}
              </a>}
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
        {visible.length<filtered.length&&<button type="button" className="rdv-explore-more"
          onClick={()=>setVisibleCount(count=>count+PAGE_SIZE)}>Mostrar mais</button>}
        {filtered.length===0&&<div className="rdv-explore-empty">
          <Compass size={24} strokeWidth={1.5}/>
          <strong>{query?'Nenhum passeio encontrado':'Nenhum passeio próximo cadastrado'}</strong>
          {query&&<button type="button" onClick={()=>{updateQuery('');updateFilter('all');}}>Limpar busca</button>}
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

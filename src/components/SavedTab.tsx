import React, {useMemo,useState} from 'react';
import {Bookmark,CheckCircle2,ChevronRight,Flag,Info,MapPin,Navigation2,Play,Share2,Trash2,Users} from 'lucide-react';
import type {TripPlan,Vehicle} from '../types';
import '../role-trips-figma.css';

interface SavedTabProps {
  trips: TripPlan[];
  vehicles: Vehicle[];
  onStartTrip: (trip: TripPlan) => void;
  onOpenShareModal: (trip: TripPlan) => void;
  onDeleteTrip: (tripId: string) => void;
  onOpenConvoyModal: (trip: TripPlan) => void;
  onCreateTrip: () => void;
  onExploreTours: () => void;
}
type TripFilter = 'completed'|'planned'|'saved';
const filters: {id:TripFilter;label:string}[]=[
  {id:'completed',label:'Concluídas'},
  {id:'planned',label:'Planejadas'},
  {id:'saved',label:'Salvas'}
];
const savedRoute=(trip:TripPlan)=>trip.status==='planned'&&!trip.departureAt;
const isPlanned=(trip:TripPlan)=>trip.status==='planned'||trip.status==='in_progress'||trip.status==='cancelled';

function EmptyRouteArtwork() {
  return <div className="rdv-trips-empty-art" aria-hidden="true">
    <svg viewBox="0 0 184 155" className="rdv-trips-empty-route" xmlns="http://www.w3.org/2000/svg">
      <path d="M35 121 C 15 82 71 83 72 63 C 75 46 65 24 89 18 C 112 12 137 16 146 26"
        stroke="#2863ed" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" fill="none" />
      <circle cx="35" cy="121" r="10" fill="#fff"/>
      <circle cx="35" cy="121" r="4.7" fill="#2863ed"/>
    </svg>
    <div className="rdv-trips-empty-flag"><Flag size={20} strokeWidth={1.7}/></div>
  </div>;
}
export const SavedTab:React.FC<SavedTabProps>=({
  trips,vehicles,onStartTrip,onOpenShareModal,onDeleteTrip,onOpenConvoyModal,
  onCreateTrip,onExploreTours
})=>{
  const [filter,setFilter]=useState<TripFilter>('completed');
  const completed=useMemo(()=>trips.filter(t=>t.status==='completed'),[trips]);
  const planned=useMemo(()=>trips.filter(isPlanned),[trips]);
  const saved=useMemo(()=>trips.filter(savedRoute),[trips]);
  const completedKm=completed.reduce((sum,trip)=>{
    const km=trip.actualDistanceKm??trip.trackedDistanceKm??0;
    return sum+(Number.isFinite(km)&&km>0?km:0);
  },0);
  const formattedKm=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(completedKm);
  const matching=filter==='completed'?completed:filter==='planned'?planned:saved;
  const ordered=useMemo(()=>[...matching].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),[matching]);
  const vehicleName=(id:string)=>{
    const v=vehicles.find(vehicle=>vehicle.id===id);
    return v ? v.nickname||`${v.brand} ${v.model}` : 'Veículo não definido';
  };
  const emptyHeading=filter==='completed'?'Seu primeiro rolê começa aqui':
    filter==='planned'?'Planeje seu próximo rolê':'Salve os lugares que quer conhecer';
  const emptyDescription=filter==='completed'
    ? 'Escolha km ou horas e saia para explorar. Suas viagens concluídas aparecem aqui.'
    : filter==='planned'
      ? 'Crie um trajeto e prepare sua próxima viagem. Seus planos aparecem aqui.'
      : 'Explore passeios e salve seus próximos destinos para visitar depois.';

  return <section className="rdv-trips-page" aria-label="Minhas viagens">
    <div className="rdv-trips-scroll">
      <header className="rdv-trips-top">
        <h1>Minhas viagens</h1>
        <div role="group" aria-label="Filtrar minhas viagens" className="rdv-trips-filters">
          {filters.map(tab=><button key={tab.id} type="button"
            aria-pressed={filter===tab.id} onClick={()=>setFilter(tab.id)}
            className={filter===tab.id?'is-selected':''}>
            {tab.id==='saved'&&<Bookmark size={16} strokeWidth={1.5}/>}
            {tab.label}
          </button>)}
        </div>
        <div className="rdv-trips-statistics" aria-label="Resumo de viagens">
          <div><strong>{formattedKm} km</strong><span>percorridos</span></div>
          <div><strong>{completed.length}</strong><span>viagens</span></div>
          <div><strong>{saved.length}</strong><span>rotas salvas</span></div>
        </div>
      </header>

      {ordered.length===0?<div className="rdv-trips-empty" role="region" aria-label="Nenhuma viagem neste filtro">
        <EmptyRouteArtwork/>
        <h2>{emptyHeading}</h2>
        <p>{emptyDescription}</p>
        <button type="button" onClick={onCreateTrip} className="rdv-trips-create">
          <Navigation2 size={15} fill="white" strokeWidth={1.8}/>
          <span>{filter==='completed'?'Criar meu primeiro rolê':'Criar um rolê'}</span>
        </button>
        <button type="button" onClick={onExploreTours} className="rdv-trips-explore">Explorar passeios</button>
      </div>:
        <div className="rdv-trips-results" aria-label="Viagens encontradas">
          {ordered.map(trip=>{
            const done=trip.status==='completed';
            const cancelled=trip.status==='cancelled';
            const verified=trip.actualTraveledVerifiedGps;
            return <article className="rdv-trips-trip" key={trip.id}>
              <div className="rdv-trips-trip-top">
                <div className="rdv-trips-trip-heading">
                  <span className={`rdv-trips-status ${done?'is-completed':'is-planned'}`}>
                    {done?'Concluída':cancelled?'Encerrada':trip.status==='in_progress'?'Em andamento':'Planejada'}
                  </span>
                  {done&&verified&&<span className="rdv-trips-gps-verified"><CheckCircle2 size={13}/> GPS verificado</span>}
                  <h3>{trip.title||trip.destinationName}</h3>
                </div>
                <button type="button" aria-label={`Excluir ${trip.title}`} onClick={()=>onDeleteTrip(trip.id)}
                  className="rdv-trips-delete"><Trash2 size={17}/></button>
              </div>
              <p className="rdv-trips-route-names">
                <MapPin size={15}/><span>{trip.originName}</span><ChevronRight size={13}/><span>{trip.destinationName}</span>
              </p>
              <div className="rdv-trips-card-metrics">
                <div><span>Distância</span><strong>{trip.distanceKm.toLocaleString('pt-BR',{maximumFractionDigits:1})} km</strong></div>
                <div><span>Duração</span><strong>{Math.round(trip.durationMinutes)} min</strong></div>
                <div><span>Veículo</span><strong>{vehicleName(trip.vehicleId)}</strong></div>
              </div>
              {trip.fuelPricePerLiter<=0&&<p className="rdv-trips-card-note">Estimativa parcial: preço do combustível não informado.</p>}
              {trip.tollsStatus!=='available'&&<p className="rdv-trips-card-note">Pedágios ainda não confirmados.</p>}
              {trip.userReview&&<p className="rdv-trips-review">{trip.userReview}</p>}
              <div className="rdv-trips-actions">
                <button type="button" onClick={()=>onOpenShareModal(trip)}><Share2 size={15}/> Compartilhar</button>
                <button type="button" onClick={()=>onOpenConvoyModal(trip)}><Users size={15}/> Comboio</button>
                {!done&&<button type="button" className="rdv-trips-start" onClick={()=>onStartTrip(trip)}>
                  <Play size={14} fill="currentColor"/>{cancelled?'Viajar novamente':trip.status==='in_progress'?'Retomar mapa':'Iniciar'}
                </button>}
              </div>
            </article>;
          })}
        </div>}
      <div className="rdv-trips-bottom-hint"><Info size={15}/><span>Só viagens concluídas somam quilômetros.</span></div>
    </div>
  </section>;
};

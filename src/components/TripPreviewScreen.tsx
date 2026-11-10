import React, {useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ArrowLeft, Bookmark, Check, Expand, Info, Minimize2, Navigation2, Play, RefreshCw, Route, RotateCcw} from 'lucide-react';
import type {TripPlan, VehicleType} from '../types';
import {InteractiveMap} from './InteractiveMap';

interface TripPreviewScreenProps {
  trip: TripPlan;
  vehicleType: VehicleType;
  isSaved: boolean;
  error?: string;
  onClose: () => void;
  onAdjust: () => void;
  onStart: () => void;
  onSave: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onDragWaypoint?: (point:[number,number])=>void;
  mapEditing?:boolean;
  mapEditError?:string;
}

function formatDistance(distance:number):string {
  return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(distance);
}

function formatDuration(durationMinutes:number):string {
  const rounded=Math.round(durationMinutes);
  return rounded < 60 ? `${rounded} min` : `${Math.floor(rounded/60)}h ${String(rounded%60).padStart(2,'0')}min`;
}

/** Tela 3/7: visual do Figma, usando dados e geometria da rota verificada. */
export function TripPreviewScreen({
  trip, vehicleType, isSaved, error, onClose, onAdjust, onStart, onSave,
  onRegenerate, regenerating = false, onDragWaypoint, mapEditing=false, mapEditError=''
}:TripPreviewScreenProps) {
  const [mapExpanded,setMapExpanded]=useState(false);
  const [mapCreditsOpen,setMapCreditsOpen]=useState(false);
  const [panelSize,setPanelSize]=useState<'compact'|'normal'|'expanded'>('normal');
  const [panelDrag,setPanelDrag]=useState(0);
  const dragStart=useRef<number|null>(null);
  const ignoreHandleClick=useRef(false);
  const finishPanelDrag=(event:PointerEvent<HTMLButtonElement>)=>{
    const start=dragStart.current;
    if(start===null)return;
    const delta=event.clientY-start;
    dragStart.current=null;
    setPanelDrag(0);
    if(Math.abs(delta)<45)return;
    setPanelSize(delta<0?'expanded':delta>145?'compact':'normal');
    ignoreHandleClick.current=true;
    window.setTimeout(()=>{ignoreHandleClick.current=false;},0);
  };
  const distance=formatDistance(trip.distanceKm);
  const minutes=Math.round(trip.durationMinutes);
  const vehicleLabel=vehicleType==='motorcycle'?'Moto':'Carro';
  const tolls=trip.tolls?.length||0;
  const tollLabel=tolls>0?`${tolls} ${tolls===1?'pedágio listado':'pedágios listados'}`:
    trip.tollsStatus==='available'?'sem pedágios':'';
  // Na prévia por KM/horas a ausência de atrações e o retorno já são evidentes
  // no mapa. Mantemos alertas realmente úteis, como distância diferente ou rota desatualizada.
  const circuit = trip.planningLimits?.mode === 'km' || trip.planningLimits?.mode === 'hours';
  const visibleWarnings = (trip.routeWarnings || []).filter(warning =>
    !circuit || !['Não foi possível consultar atrações externas.',
      'Roteiro rodoviário verificado. Não foram incluídas atrações',
      'O roteiro retorna ao ponto inicial.'].some(prefix => warning.startsWith(prefix)));
  const subtitle=trip.isCircular?
    `${trip.originName} → retorno ao início`:
    `${trip.originName} → ${trip.destinationName}`;

  return <div className="rdv-preview-overlay">
    <section role="dialog" aria-modal="true" aria-label="Visualizar viagem"
      className={`rdv-preview-screen ${mapExpanded?'rdv-preview-map-expanded':''}`}
      data-panel-size={panelSize} data-panel-dragging={panelDrag!==0}
      style={{'--preview-panel-drag-y':`${panelDrag}px`} as CSSProperties}
      data-testid="figma-trip-preview">
      <div className="rdv-preview-route-map rdv-flat-map" aria-label="Mapa real do trajeto" data-credits-open={mapCreditsOpen}>
        <InteractiveMap roadStyle initialStyle="light"
          originCoords={trip.originCoords} destinationCoords={trip.destinationCoords}
          routePath={trip.routePath} navigationMode={false}
          blueRoute showFuelStations={false}
          onDragWaypoint={mapEditing?undefined:onDragWaypoint}
          stops={trip.stops} tolls={trip.tolls||[]}
          tollVehicleType={vehicleType} className="w-full h-full"/>
        <button type="button" className="rdv-map-credits-button" aria-expanded={mapCreditsOpen}
          aria-label={mapCreditsOpen?'Recolher créditos do mapa':'Mostrar créditos do mapa'}
          onClick={()=>setMapCreditsOpen(value=>!value)}><Info size={17}/></button>
      </div>
      <header className="rdv-preview-header">
        <button type="button" aria-label="Fechar janela" onClick={onClose}
          className="rdv-preview-back"><ArrowLeft size={24}/></button>
        <h1>Seu próximo rolê</h1>
      </header>
      <div className="rdv-preview-route-type">
        <Route size={16}/>Trajeto verificado
      </div>
      <div className="rdv-preview-map-stat">{distance} km · {minutes} min</div>
      {onDragWaypoint && <p className="absolute left-3 top-[31%] z-20 rounded-xl border border-blue-200 bg-white/95 px-3 py-2 text-xs text-blue-800 shadow-md pointer-events-none">
        {mapEditing?'Recalculando pelas ruas…':'Toque na linha da rota e arraste a bolinha para mudar o trajeto'}
      </p>}
      <div className="rdv-preview-map-controls">
        <span className="rdv-preview-origin-label">
          <Navigation2 size={16}/>{trip.isCircular?'Saída e chegada':'Ponto de partida'}
        </span>
        <button type="button" onClick={()=>setMapExpanded(value=>!value)}
          aria-label={mapExpanded?'Recolher mapa':'Expandir mapa'}
          className="rdv-preview-map-expand">
          {mapExpanded?<Minimize2 size={20}/>:<Expand size={20}/>}
        </button>
      </div>
      <div className="rdv-preview-details" data-testid="figma-preview-details">
        <button type="button" className="rdv-preview-panel-drag-handle"
          aria-label="Arrastar detalhes para expandir ou recolher"
          onPointerDown={event=>{
            if(!event.isPrimary||event.button!==0)return;
            dragStart.current=event.clientY;
            ignoreHandleClick.current=false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event=>{
            if(dragStart.current!==null)setPanelDrag(Math.max(-450,Math.min(450,event.clientY-dragStart.current)));
          }}
          onPointerUp={finishPanelDrag}
          onPointerCancel={()=>{dragStart.current=null;setPanelDrag(0);}}
          onLostPointerCapture={()=>{dragStart.current=null;setPanelDrag(0);}}
          onClick={()=>{if(!ignoreHandleClick.current)setPanelSize(value=>value==='expanded'?'normal':'expanded');}}>
          <span className="rdv-preview-handle" aria-hidden="true"/>
        </button>
        <div className="rdv-preview-title-row">
          <h2>{trip.title||trip.destinationName}</h2>
          <button type="button" aria-label={isSaved?'Rota salva':'Salvar rota'}
            aria-pressed={isSaved} disabled={isSaved}
            title={isSaved?'Rota já salva':'Salvar rota nas minhas viagens'}
            onClick={onSave} className="rdv-preview-bookmark">
            {isSaved?<Check size={21}/>:<Bookmark size={21}/>}
          </button>
        </div>
        <p className="rdv-preview-subtitle">{subtitle}</p>
        <div className="rdv-preview-metrics">
          <div className="rdv-preview-metric">
            <strong>{distance} km</strong><span>distância total</span>
          </div>
          <div className="rdv-preview-metric">
            <strong>{minutes} min</strong><span>tempo estimado</span>
          </div>
          <span className="rdv-preview-vehicle">{vehicleLabel}</span>
        </div>
        <p className="rdv-preview-meta">
          <RotateCcw size={15}/>
          {trip.isCircular?'Volta ao início':'Só ida'}{tollLabel?` · ${tollLabel}`:''}
        </p>
        {onRegenerate && <button type="button" aria-label="Gerar outra rota"
          disabled={regenerating} onClick={onRegenerate}
          className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-blue-700 shadow-sm disabled:opacity-60 w-fit">
          <RefreshCw size={18} className={regenerating?'animate-spin':''}/>
          {regenerating?'Buscando outra rota…':'Outra rota'}
        </button>}
        {visibleWarnings.map((warning,i)=><p className="rdv-preview-notice" key={i}>{warning}</p>)}
        {error && <p className="rdv-preview-notice" role="alert">{error}</p>}
        {mapEditError && <p className="rdv-preview-notice" role="alert">{mapEditError}</p>}
        <div className="rdv-preview-actions">
          <button type="button" onClick={onAdjust} className="rdv-preview-adjust">Ajustar</button>
          <button type="button" onClick={onStart} disabled={mapEditing} className="rdv-preview-start">
            <Play size={16} fill="currentColor"/> Iniciar rolê
          </button>
        </div>
      </div>
    </section>
  </div>;
}

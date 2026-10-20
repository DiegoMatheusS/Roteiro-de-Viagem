import React, {useState} from 'react';
import {ArrowLeft, Bookmark, Check, Expand, Minimize2, Navigation2, Play, RefreshCw, Route, RotateCcw} from 'lucide-react';
import type {TripPlan, VehicleType} from '../types';
import {InteractiveMap} from './InteractiveMap';

interface TripPreviewScreenProps {
  trip: TripPlan;
  vehicleType: VehicleType;
  isSaved: boolean;
  tollNotice?: string;
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
  trip, vehicleType, isSaved, tollNotice, error, onClose, onAdjust, onStart, onSave,
  onRegenerate, regenerating = false, onDragWaypoint, mapEditing=false, mapEditError=''
}:TripPreviewScreenProps) {
  const [mapExpanded,setMapExpanded]=useState(false);
  const distance=formatDistance(trip.distanceKm);
  const minutes=Math.round(trip.durationMinutes);
  const vehicleLabel=vehicleType==='motorcycle'?'Moto':'Carro';
  const tolls=trip.tolls?.length||0;
  const tollLabel=tolls>0?`${tolls} ${tolls===1?'pedágio listado':'pedágios listados'}`:
    trip.tollsStatus==='available'?'sem pedágios':'pedágios a confirmar';
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
      data-testid="figma-trip-preview">
      <div className="rdv-preview-route-map rdv-flat-map" aria-label="Mapa real do trajeto">
        <InteractiveMap roadStyle initialStyle="light"
          originCoords={trip.originCoords} destinationCoords={trip.destinationCoords}
          routePath={trip.routePath} navigationMode={false}
          blueRoute showFuelStations={false}
          editableWaypoint={onDragWaypoint && trip.routePath.length>2?
            trip.editedWaypoint||trip.routePath[Math.floor(trip.routePath.length/2)]:undefined}
          onDragWaypoint={mapEditing?undefined:onDragWaypoint}
          stops={trip.stops} tolls={trip.tolls||[]}
          tollVehicleType={vehicleType} className="w-full h-full"/>
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
        {mapEditing?'Recalculando pelas ruas…':'Arraste o ponto azul para mudar o trajeto'}
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
        <span className="rdv-preview-handle" aria-hidden="true"/>
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
          {trip.isCircular?'Volta ao início':'Só ida'} · {tollLabel}
        </p>
        {onRegenerate && <button type="button" aria-label="Gerar outra rota"
          disabled={regenerating} onClick={onRegenerate}
          className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-[14px] font-semibold text-blue-700 shadow-sm disabled:opacity-60 w-fit">
          <RefreshCw size={18} className={regenerating?'animate-spin':''}/>
          {regenerating?'Buscando outra rota…':'Outra rota'}
        </button>}
        {tollNotice && <p className="rdv-preview-notice" role="status">{tollNotice}</p>}
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

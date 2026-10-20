import React from 'react';
import { ArrowLeft, Check, Clock3, Crosshair, Repeat2, Route } from 'lucide-react';
import { InteractiveMap } from './InteractiveMap';
import { parseTouristTarget } from '../services/touristTargetInput';

type CircuitMode = 'km' | 'hours';
type CircuitPreference = 'tranquila' | 'curvas' | 'cidades';

interface CreateTouristCircuitScreenProps {
  mode: CircuitMode;
  km: string;
  hours: string;
  travelMode: 'car' | 'motorcycle';
  coords?: [number,number];
  tripType: 'round_trip' | 'one_way';
  preference: CircuitPreference;
  busy: boolean;
  warning: string | null;
  validation: string | null;
  error: string;
  onClose: () => void;
  onModeChange: (mode: CircuitMode) => void;
  onKmChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onStep: (increase: boolean) => void;
  onTripTypeChange: () => void;
  onPreferenceChange: (preference: CircuitPreference) => void;
  onTravelModeChange: (value: 'car'|'motorcycle') => void;
  onSubmit: () => void;
}

/**
 * Tela 2/7 — fiel ao PNG "Criar rolê • distância ou duração".
 * O mapa e os valores permanecem funcionais; a busca por rota verificada
 * continua no fluxo já existente do NavigationHome.
 */
export function CreateTouristCircuitScreen({
  mode, km, hours, travelMode, coords, tripType, preference, busy, warning,
  validation, error, onClose, onModeChange, onKmChange, onHoursChange,
  onStep, onTripTypeChange, onPreferenceChange, onTravelModeChange, onSubmit
}: CreateTouristCircuitScreenProps) {
  const value=mode==='km'?km:hours;
  const options=mode==='km'?[10,20,30,50]:[1,2,3,4];

  return <div className="rdv-create-overlay">
    <section role="dialog" aria-modal="true" aria-label="Criar um rolê" className="rdv-create-screen">
      <div className="rdv-create-map" aria-label="Mapa da sua localização">
        <InteractiveMap roadStyle initialStyle="light" userLiveCoords={coords}
          showFuelStations={false} className="w-full h-full"/>
      </div>
      <header className="rdv-create-header">
        <button type="button" aria-label="Voltar" onClick={onClose} className="rdv-create-back">
          <ArrowLeft size={24} strokeWidth={1.9}/>
        </button>
        <h1>Criar rolê</h1>
      </header>
      <div className="rdv-create-origin">
        <Crosshair size={19} strokeWidth={2} aria-hidden="true"/>
        <span>{coords?'Da sua localização atual':'Ative o GPS para definir a origem'}</span>
        {coords && <Check size={19} aria-hidden="true"/>}
      </div>

      <div className="rdv-create-panel" data-testid="figma-create-trip-panel">
        <div className="rdv-create-handle" aria-hidden="true"/>
        <h2>Quanto você quer rodar?</h2>

        <div className="rdv-create-tabs" role="group" aria-label="Tipo de planejamento">
          <button type="button" aria-pressed={mode==='km'} onClick={()=>onModeChange('km')}
            className={mode==='km'?'is-selected':''}>
            <Route size={17} strokeWidth={1.7}/> Distância · km
          </button>
          <button type="button" aria-pressed={mode==='hours'} onClick={()=>onModeChange('hours')}
            className={mode==='hours'?'is-selected':''}>
            <Clock3 size={17} strokeWidth={1.7}/> Duração · horas
          </button>
        </div>

        <div className="rdv-create-stepper">
          <button type="button" aria-label="Diminuir quantidade" onClick={()=>onStep(false)}>−</button>
          <label className="rdv-create-value">
            <input aria-label={mode==='km'?'Quantidade de quilômetros':'Quantidade de horas'}
              type="text" inputMode="decimal" value={value}
              onChange={event=>mode==='km'?onKmChange(event.target.value):onHoursChange(event.target.value)}/>
            <span>{mode==='km'?'km':'h'}</span>
          </label>
          <button type="button" aria-label="Aumentar quantidade" onClick={()=>onStep(true)}>+</button>
        </div>

        <div className="rdv-create-chips" role="group" aria-label="Valores rápidos">
          {options.map(option=><button type="button" key={option}
            aria-pressed={parseTouristTarget(value)===option}
            onClick={()=>mode==='km'?onKmChange(String(option)):onHoursChange(String(option))}
            className={parseTouristTarget(value)===option?'is-selected':''}>
              {option} {mode==='km'?'km':'h'}
            </button>)}
        </div>

        <div className="rdv-create-vehicle-row">
          <strong>Vou de</strong>
          <div className="rdv-create-vehicle-actions">
            <button type="button" aria-pressed={travelMode==='car'}
              className={travelMode==='car'?'is-selected':''}
              onClick={()=>onTravelModeChange('car')}>
              Carro
            </button>
            <button type="button" aria-pressed={travelMode==='motorcycle'}
              className={travelMode==='motorcycle'?'is-selected':''}
              onClick={()=>onTravelModeChange('motorcycle')}>
              Moto
            </button>
          </div>
        </div>

        <button type="button" className="rdv-create-return" role="switch"
          aria-checked={tripType==='round_trip'} onClick={onTripTypeChange}>
          <Repeat2 size={22} strokeWidth={1.7}/>
          <span className="rdv-create-return-copy">
            <strong>Voltar ao ponto de partida</strong>
            <small>Um circuito, sem precisar de destino.</small>
          </span>
          <span className={`rdv-create-toggle ${tripType==='round_trip'?'is-on':''}`}>
            <span/>
          </span>
        </button>

        {warning && <p className="rdv-create-message" role="status">{warning}</p>}
        {validation && <p className="rdv-create-message" role="alert">{validation}</p>}
        {error && <p className="rdv-create-message" role="alert">{error}</p>}

        <button type="button" className="rdv-create-submit" disabled={busy || Boolean(validation)}
          onClick={onSubmit}>{busy?'Preparando seu rolê…':'Ver meu trajeto'}</button>
        <p className="rdv-create-disclaimer">Distância e tempo aproximados.</p>

        <details className="rdv-create-advanced">
          <summary>Preferências do trajeto</summary>
          <div role="group" aria-label="Preferência turística" className="rdv-create-preference-options">
            {([['tranquila','Rota tranquila'],['curvas','Mais curvas'],['cidades','Cidades turísticas']] as const)
              .map(([id,label])=><button key={id} type="button" aria-pressed={preference===id}
                onClick={()=>onPreferenceChange(id)} className={preference===id?'is-selected':''}>{label}</button>)}
          </div>
        </details>
      </div>
    </section>
  </div>;
}

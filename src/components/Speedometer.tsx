import { useEffect, useState } from 'react';
import type { DeviceLocation } from '../services/locationService';
import { useRoadSpeedLimit } from '../hooks/useRoadSpeedLimit';
import { classifySpeed, type SpeedState } from '../services/roadSpeedLimit';

type Props = {
  position: DeviceLocation | null;
  className?: string;
};

const variants: Record<SpeedState, string> = {
  neutral: 'rdv-speedometer--neutral',
  normal: 'rdv-speedometer--normal',
  attention: 'rdv-speedometer--attention',
  excess: 'rdv-speedometer--excess'
};

export function Speedometer({ position, className = '' }: Props) {
  const speed = position?.speedMetersPerSecond != null &&
    Number.isFinite(position.speedMetersPerSecond) &&
    Date.now() - position.timestamp <= 15000
    ? position.speedMetersPerSecond * 3.6 : null;
  const limit = useRoadSpeedLimit(position);
  const calculatedState = classifySpeed(speed, limit);
  const [settledState, setSettledState] = useState<SpeedState>('neutral');

  useEffect(() => {
    // Excesso deve acender imediatamente; saída do excesso aguarda estabilização
    // de uma leitura do GPS para evitar cintilação nas pequenas oscilações.
    if (calculatedState === 'excess' || calculatedState === 'neutral') {
      setSettledState(calculatedState);
      return;
    }
    const timer = window.setTimeout(() => setSettledState(calculatedState), 650);
    return () => window.clearTimeout(timer);
  }, [calculatedState]);
  const state = calculatedState === 'excess' || calculatedState === 'neutral'
    ? calculatedState : settledState;
  const displayed = speed === null ? '—' :
    Math.max(0, calculatedState === 'excess' ? Math.ceil(speed) : Math.round(speed));
  const label = speed === null ? 'Velocidade indisponível' :
    'Velocidade atual: ' + displayed + ' quilômetros por hora' +
    (limit === null ? '. Limite da via indisponível.' :
      '. Limite informado no OpenStreetMap: ' + limit + ' quilômetros por hora.' +
      (state === 'excess' ? ' Acima do limite informado.' :
        state === 'attention' ? ' Próximo do limite.' : ''));
  return (
    <div role="status" aria-label={`Velocímetro. ${label}`}
      title={limit === null ? 'Limite da via indisponível' : 'Limite cadastrado no OpenStreetMap: ' + limit + ' km/h. Confira a sinalização.'}
      className={['rdv-speedometer', variants[state], className].join(' ')}>
      <strong className="rdv-speedometer__number">{displayed}</strong>
      <span className="rdv-speedometer__unit">km/h</span>
      {limit !== null && <span aria-hidden="true" className="rdv-speedometer__limit">máx. {limit}</span>}
    </div>
  );
}

import { RouteConditionsStatus,type ConditionsStatus } from './RouteConditionsStatus';
import React, { useEffect, useState } from 'react';
import type { CameraMode } from '../services/mapCameraController';
import confetti from 'canvas-confetti';
import { TripPlan, Vehicle, Achievement, ConvoyParticipant, MeetingPoint } from '../types';
import { InteractiveMap } from './InteractiveMap';
import { Speedometer } from './Speedometer';
import { nextNavigationGuidance } from '../services/navigationGuidance';
import { RoadAlertReporter } from './RoadAlertReporter';
import { useRoadAlerts } from '../hooks/useRoadAlerts';
import { upcomingRoadAlert } from '../services/roadAlertDistance';
import { ROAD_ALERT_TYPES } from '../types/roadAlerts';
import type { useTripTracking } from '../hooks/useTripTracking';
import { 
  Navigation, PowerOff, ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw,
  MapPin, 
  AlertOctagon, 
  Home, 
  CloudRain, 
  Sun, 
  CheckCircle, 
  Radio, 
  Compass,
  LocateFixed,
  ChevronDown,
  ShieldCheck,
  Award
} from 'lucide-react';

interface ActiveTripModalProps {
  convoyParticipants?:ConvoyParticipant[];meetingPoints?:MeetingPoint[];
  trip: TripPlan;
  vehicle: Vehicle;
  tracking: ReturnType<typeof useTripTracking>;
  conditions: ConditionsStatus;
  isOpen: boolean;
  onClose: () => void;
  onEndTrip: () => void;
  onCompleteTrip: (tripId: string, actualKm: number, verifiedGps: boolean) => { newAchievements: Achievement[]; leveledUp: boolean };
  onOpenSos: () => void;
  onReturnHome: () => void;
}

export const ActiveTripModal: React.FC<ActiveTripModalProps> = ({
  trip,
  convoyParticipants, meetingPoints,
  vehicle,
  tracking,
  conditions,
  isOpen,
  onClose,
  onEndTrip,
  onCompleteTrip,
  onOpenSos,
  onReturnHome
}) => {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [showRouteDetails,setShowRouteDetails] = useState(false);
  const [centerRequest,setCenterRequest] = useState(0);
  const [cameraMode,setCameraMode]=useState<CameraMode>('following');
  useEffect(()=>{if(!isOpen)setCameraMode('following');},[isOpen,trip.id]);
  const [manualCompletion, setManualCompletion] = useState(false);
  const [manualDistance, setManualDistance] = useState('');
  const [unlockedCelebration, setUnlockedCelebration] = useState<Achievement[] | null>(null);
  const roadAlerts = useRoadAlerts(trip.routePath);

  if (!isOpen) return null;

  const currentSpeed = tracking.speedKmH;
  const nextTurn = nextNavigationGuidance(trip.routePath,trip.routeSteps,
    tracking.status === 'ready' ? tracking.position?.coords : undefined,tracking.distanceKm,trip.distanceKm);
  const isGpsActive = tracking.status === 'ready';
  const distanceTraveledKm = tracking.distanceKm;
  const remainingKm = Math.max(0, trip.distanceKm - distanceTraveledKm);
  const completionGpsVerified = !manualCompletion && distanceTraveledKm > 0;
  const actualKm = completionGpsVerified ? distanceTraveledKm : Number(manualDistance.replace(',', '.'));
  const canFinish = Number.isFinite(actualKm) && actualKm > 0;
  const nextStop = trip.stops[0];
  const upcoming = tracking.status === 'ready'
    ? upcomingRoadAlert(roadAlerts.alerts, trip.routePath, tracking.position?.coords, distanceTraveledKm, trip.distanceKm)
    : null;

  const handleFinish = () => {
    if (!canFinish) return;
    const res = onCompleteTrip(trip.id, Number(actualKm.toFixed(3)), completionGpsVerified);
    if (res.newAchievements.length > 0 || res.leveledUp) {
      setUnlockedCelebration(res.newAchievements);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else {
      setShowCompletionDialog(false);
      onClose();
    }
  };

  return (
    <div className="rdv-figma-active-route fixed inset-0 z-50 flex flex-col bg-slate-100 text-slate-900 animate-in fade-in overflow-hidden">
      {/* Compact navigation prompt: no secondary header over the map. */}
      <div role="status" aria-label="Próxima orientação de navegação"
        className="relative z-20 flex min-h-[86px] shrink-0 items-center gap-3 rounded-[18px] mx-4 mt-[max(60px,env(safe-area-inset-top))] mb-1 bg-[#245ee9] px-4 py-3 pr-[96px] text-white shadow-sm">
        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-white/10">
          {nextTurn?.direction === 'left' ? <CornerUpLeft size={32} strokeWidth={2.6} /> : nextTurn?.direction === 'right' ? <CornerUpRight size={32} strokeWidth={2.6} /> : nextTurn?.direction === 'roundabout' ? <RotateCcw size={30} strokeWidth={2.5}/> : nextTurn?.direction === 'arrive' ? <MapPin size={29}/> : <ArrowUp size={32} strokeWidth={2.6}/>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[23px] font-bold tabular-nums text-white leading-tight">{nextTurn ? (nextTurn.meters >= 1000 ? `${(nextTurn.meters/1000).toFixed(1).replace('.',',')} km` : `${nextTurn.meters} m`) : 'Navegação em andamento'}</p>
          <p className="truncate text-[16px] font-semibold leading-tight tracking-tight">{nextTurn?.text || 'Continue na rota'}</p>
          {nextTurn?.road && <p className="truncate text-xs text-blue-100">{nextTurn.road}</p>}
        </div>
      </div>
      <button type="button" onClick={onOpenSos} aria-label="SOS" title="SOS - emergência"
        className="absolute right-3 top-[max(14px,env(safe-area-inset-top))] z-40 flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-rose-600 px-3 text-white shadow-[0_7px_20px_rgba(190,24,93,.33)] transition-transform active:scale-95">
        <AlertOctagon size={20} strokeWidth={2.3}/><span className="text-xs font-semibold">SOS</span>
      </button>
      {tracking.error && <div role="alert" className="px-4 py-2 text-xs bg-amber-50 text-amber-900 flex items-center justify-between gap-2">{tracking.error}<button onClick={tracking.retry} className="font-bold">Tentar GPS novamente</button></div>}

      {/* MOTORCYCLE RAIN WEATHER ALERT IF APPLICABLE (Requirement #23) */}
      {(trip.hasRainRisk || trip.weatherPoints.some(p => p.warning)) && vehicle.type === 'motorcycle' && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 shrink-0" />
            <span>Atenção: chuva ou tempo adverso no percurso.</span>
          </div>
        </div>
      )}

      {/* MAP AND ROUTE CONTAINER */}
      <div className="flex-1 relative rdv-flat-map">
        <InteractiveMap convoyParticipants={convoyParticipants} meetingPoints={meetingPoints}
          originCoords={trip.originCoords}
          destinationCoords={trip.destinationCoords}
          routePath={trip.routePath}
          navigationMode
          onCameraModeChange={setCameraMode}
          travelledDistanceKm={distanceTraveledKm}
          totalRouteKm={trip.distanceKm}
          stops={trip.stops}
          weatherPoints={trip.weatherPoints}
          roadAlerts={roadAlerts.alerts}
          centerOnUserRequest={centerRequest}
          tolls={trip.tolls || []}
          tollVehicleType={vehicle.type}
          userLiveCoords={isGpsActive ? tracking.position?.coords : undefined}
           userHeadingDegrees={isGpsActive ? tracking.position?.headingDegrees : null}
           userSpeedMetersPerSecond={isGpsActive ? tracking.position?.speedMetersPerSecond : null}
          showRainLayer={trip.hasRainRisk}
          className="w-full h-full"
        />

        {/* Fixed controls only: all remaining space belongs to map gestures. */}
        <div className="pointer-events-none absolute bottom-24 right-3 z-30 flex flex-col items-center gap-3">
          <button type="button" aria-label="Centralizar mapa na minha localização"
            title={cameraMode==='exploring'?'Voltar a seguir o GPS':'Centralizar GPS'}
            onClick={()=>setCenterRequest(v=>v+1)} disabled={!isGpsActive}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-blue-700 shadow-[0_6px_20px_rgba(15,23,42,.18)] transition-transform active:scale-95 disabled:opacity-60">
            <LocateFixed size={23} strokeWidth={2.2}/>
          </button>
          <div className="pointer-events-auto">
            <RoadAlertReporter location={isGpsActive ? tracking.position : null} speedKmH={currentSpeed}
              onSubmitted={() => { void roadAlerts.reload(); }} />
          </div>
        </div>
        {upcoming && <div role="status" className="pointer-events-none absolute left-3 right-[75px] top-3 z-30 max-w-[300px] rounded-[18px] border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-950 shadow-md">
          {ROAD_ALERT_TYPES.find(type => type.id === upcoming.alert.kind)?.label} · ~{upcoming.distanceKm.toFixed(1)} km à frente
        </div>}

        {/* Velocímetro com limite explícito da via (ou estado neutro). */}
        <Speedometer position={isGpsActive ? tracking.position : null}
          className="absolute bottom-3 left-3 z-30" />
      </div>

      {/* Compact native-like bottom dock. Weather and tolls live here, never over the map. */}
      <div className="z-20 shrink-0 space-y-3 rounded-t-[24px] border-t border-slate-200/80 bg-white px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-4px_14px_rgba(15,23,42,.07)]">
        <div className={`grid gap-2 text-center ${nextStop?'grid-cols-3':'grid-cols-2'}`}>
          <div className="min-w-0 rounded-[12px] bg-white px-2 py-2.5">
            <span className="block text-[10px] font-medium text-slate-500">RESTANTE</span>
            <strong className="block text-[16px] font-semibold tabular-nums text-slate-900">{remainingKm.toFixed(1)} km</strong>
          </div>
          <div className="min-w-0 rounded-[12px] bg-white px-2 py-2.5">
            <span className="block text-[10px] font-medium text-slate-500">TEMPO RESTANTE</span>
            <strong className="block text-[16px] font-semibold tabular-nums text-[#245ee9]">~{Math.max(0, Math.round(remainingKm / Math.max(trip.distanceKm, 0.001) * trip.durationMinutes))} min</strong>
          </div>
          {nextStop && <div className="min-w-0 rounded-[18px] border border-slate-200/80 bg-slate-50 px-2 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,.04)]">
            <span className="block text-[10px] font-medium text-slate-500">PRÓXIMA PARADA</span>
            <strong className="block truncate text-[13px] font-semibold text-slate-900">{nextStop.name}</strong>
          </div>}
        </div>
        <button type="button" aria-label="Detalhes de clima e pedágios" aria-expanded={showRouteDetails}
          onClick={()=>setShowRouteDetails(value=>!value)}
          className="flex min-h-9 w-full items-center justify-between rounded-xl px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
          <span className="flex items-center gap-2"><CloudRain size={16}/> Clima e pedágios</span>
          <ChevronDown size={17} className={`transition-transform duration-200 ${showRouteDetails?'rotate-180':''}`}/>
        </button>
        {showRouteDetails && <div className="max-h-[32dvh] space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">
          <RouteConditionsStatus trip={trip} conditions={conditions}/>
          <button type="button" onClick={()=>setShowHomeConfirm(true)}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-medium text-blue-700 shadow-sm"><Home size={17}/> Traçar rota para casa</button>
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setShowEndConfirm(true)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 shadow-[0_3px_12px_rgba(15,23,42,.05)]">
            <PowerOff size={18}/> Encerrar viagem
          </button>
          <button type="button" onClick={() => setShowCompletionDialog(true)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-[0_5px_16px_rgba(5,150,105,.22)] active:scale-[.99]">
            <CheckCircle size={19}/> Concluir Viagem
          </button>
        </div>
      </div>

      {showEndConfirm && <div role="dialog" aria-modal="true" aria-label="Encerrar viagem" className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 max-w-sm space-y-4"><h3 className="font-bold">Encerrar esta viagem?</h3><p className="text-sm text-slate-600">A navegação será interrompida e a viagem ficará no histórico como encerrada, sem contabilizar uma conclusão ou medalhas.</p><div className="flex gap-3"><button onClick={() => setShowEndConfirm(false)} className="p-3 border rounded-xl">Continuar viagem</button><button onClick={onEndTrip} className="p-3 bg-rose-700 text-white rounded-xl">Sim, encerrar</button></div></div></div>}

      {/* COMPLETION DIALOG (Requirement #7: Updates profile, vehicle, and achievements) */}
      {showCompletionDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl p-6 space-y-4 shadow-2xl">
            {unlockedCelebration ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-2xl">
                  🏆
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Viagem Concluída com Sucesso!
                </h3>
                <p className="text-xs text-slate-600">
                  Parabéns! Sua quilometragem foi computada no perfil e nas estatísticas do veículo.
                </p>
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-950 font-bold">
                  {unlockedCelebration.map(a => `🎖️ Nova Medalha: ${a.title}`).join(' · ')}
                </div>
                <button
                  onClick={() => {
                    setShowCompletionDialog(false);
                    onClose();
                  }}
                  className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs"
                >
                  Continuar
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <span>Finalizar e Registrar Viagem</span>
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Confirme a distância percorrida para atualizar seu Nível do Viajante, estatísticas do veículo e desbloquear conquistas:
                </p>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Quilometragem realizada:</span>
                    <strong className="text-slate-900 text-sm">{distanceTraveledKm.toFixed(2)} km pelo GPS</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Veículo utilizado:</span>
                    <strong className="text-slate-900">{vehicle.nickname || vehicle.model}</strong>
                  </div>
                </div>

                {/* GPS vs Manual verification toggle (Requirement #2 & #7) */}
                <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualCompletion || distanceTraveledKm === 0}
                    onChange={(e) => setManualCompletion(e.target.checked)}
                    disabled={distanceTraveledKm === 0}
                    className="mt-0.5 rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-emerald-950 block">Informar distância manualmente</span>
                    <span className="text-[11px] text-slate-600">
                      {distanceTraveledKm > 0 ? 'Desmarque para usar somente a distância medida pelo GPS nesta sessão.' : 'Nenhum deslocamento foi medido pelo GPS nesta sessão.'}
                    </span>
                  </div>
                </label>
                {!completionGpsVerified && <label className="block text-xs font-semibold text-slate-700">Distância percorrida (km)<input aria-label="Distância percorrida manualmente" type="number" min="0.001" step="0.001" value={manualDistance} onChange={e => setManualDistance(e.target.value)} className="mt-1 w-full border rounded-xl p-3" placeholder="Informe a distância que percorreu" /></label>}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setShowCompletionDialog(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={!canFinish}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700"
                  >
                    Confirmar Chegada
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMAÇÃO PARA VOLTAR PRA CASA */}
      {showHomeConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white text-slate-900 rounded-3xl p-5 border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
              <Home className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900">
                Traçar Rota para Casa?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Deseja recalcular a navegação agora para o seu endereço residencial cadastrado?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowHomeConfirm(false)}
                className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHomeConfirm(false);
                  onReturnHome();
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition-colors shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Sim, Ir pra Casa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


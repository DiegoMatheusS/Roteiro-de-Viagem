import { RouteConditionsStatus,type ConditionsStatus } from './RouteConditionsStatus';
import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { TripPlan, Vehicle, Achievement, ConvoyParticipant, MeetingPoint } from '../types';
import { InteractiveMap } from './InteractiveMap';
import type { useTripTracking } from '../hooks/useTripTracking';
import { 
  Navigation, ArrowLeft, PowerOff,
  MapPin, 
  AlertOctagon, 
  Home, 
  CloudRain, 
  Sun, 
  CheckCircle, 
  X, 
  Radio, 
  Compass, 
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
  const [manualCompletion, setManualCompletion] = useState(false);
  const [manualDistance, setManualDistance] = useState('');
  const [unlockedCelebration, setUnlockedCelebration] = useState<Achievement[] | null>(null);

  if (!isOpen) return null;

  const currentSpeed = tracking.speedKmH;
  const isGpsActive = tracking.status === 'ready';
  const distanceTraveledKm = tracking.distanceKm;
  const remainingKm = Math.max(0, trip.distanceKm - distanceTraveledKm);
  const completionGpsVerified = !manualCompletion && distanceTraveledKm > 0;
  const actualKm = completionGpsVerified ? distanceTraveledKm : Number(manualDistance.replace(',', '.'));
  const canFinish = Number.isFinite(actualKm) && actualKm > 0;
  const nextStop = trip.stops[0];

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 text-slate-900 animate-in fade-in overflow-hidden">
      {/* TOP ACTIVE NAVIGATION HUD - WHITE THEME */}
      <div className="bg-white/95 border-b border-slate-200 p-4 flex items-center justify-between shrink-0 z-20 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3">
          <button onClick={onClose} aria-label="Voltar ao menu e manter viagem ativa" title="Voltar ao menu" className="w-10 h-10 shrink-0 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-sm font-extrabold text-slate-900 truncate max-w-[120px] sm:max-w-[200px]">
                {trip.destinationName.split('-')[0].trim()}
              </h2>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {vehicle.nickname || vehicle.model} · {currentSpeed ?? '—'} km/h
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quero Voltar Pra Casa - Com Confirmação */}
          <button
            onClick={() => setShowHomeConfirm(true)}
            className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
            title="Calcular retorno para casa"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar pra Casa</span>
          </button>

          {/* SOS BUTTON (Requirement #29) */}
          <button
            onClick={onOpenSos}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1 shadow-md shadow-rose-600/30 transition-transform active:scale-95 cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>SOS</span>
          </button>

          <button
            aria-label="Minimizar navegação"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {tracking.error && <div role="alert" className="px-4 py-2 text-xs bg-amber-50 text-amber-900 flex items-center justify-between gap-2">{tracking.error}<button onClick={tracking.retry} className="font-bold">Tentar GPS novamente</button></div>}

      {/* MOTORCYCLE RAIN WEATHER ALERT IF APPLICABLE (Requirement #23) */}
      {(trip.hasRainRisk || trip.weatherPoints.some(p => p.warning)) && vehicle.type === 'motorcycle' && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 shrink-0" />
            <span>Condições meteorológicas adversas previstas no percurso. Confira a previsão e as condições da pista.</span>
          </div>
        </div>
      )}

      {/* MAP AND ROUTE CONTAINER */}
      <div className="flex-1 relative">
        <InteractiveMap convoyParticipants={convoyParticipants} meetingPoints={meetingPoints}
          originCoords={trip.originCoords}
          destinationCoords={trip.destinationCoords}
          routePath={trip.routePath}
          navigationMode
          travelledDistanceKm={distanceTraveledKm}
          totalRouteKm={trip.distanceKm}
          stops={trip.stops}
          weatherPoints={trip.weatherPoints}
          tolls={trip.tolls || []}
          tollVehicleType={vehicle.type}
          userLiveCoords={isGpsActive ? tracking.position?.coords : undefined}
          showRainLayer={trip.hasRainRisk}
          className="w-full h-full"
        />

        <div className="absolute bottom-20 left-3 right-16 max-w-[260px] z-30"><RouteConditionsStatus trip={trip} conditions={conditions} /></div>

        {/* Velocímetro circular no canto inferior esquerdo, inspirado em navegação. */}
        <div className="absolute bottom-3 left-3 z-30 w-20 h-20 rounded-full bg-white border-[5px] border-slate-700 shadow-2xl flex flex-col items-center justify-center" role="status" aria-label={`Velocidade atual: ${currentSpeed ?? 'indisponível'} quilômetros por hora`}>
          <strong className="text-2xl leading-none font-black text-slate-900 tabular-nums">{currentSpeed ?? '—'}</strong>
          <span className="text-[10px] font-extrabold text-slate-500">km/h</span>
        </div>
      </div>

      {/* BOTTOM NAVIGATION CONTROLS - WHITE MENU */}
      <div className="bg-white border-t border-slate-200 p-4 space-y-3 shrink-0 shadow-xl">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-bold block">RESTANTE</span>
            <strong className="text-sm font-extrabold text-slate-900">{remainingKm.toFixed(1)} km</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-bold block">TEMPO RESTANTE</span>
            <strong className="text-sm font-extrabold text-emerald-700">
              ~{Math.max(0, Math.round(remainingKm / Math.max(trip.distanceKm, 0.001) * trip.durationMinutes))} min
            </strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-bold block">PRÓXIMA PARADA</span>
            <strong className="text-xs font-bold text-slate-800 truncate block">
              {nextStop ? nextStop.name.split(' ')[0] : 'Destino final'}
            </strong>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setShowEndConfirm(true)} className="py-2.5 px-3 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex gap-2 items-center"><PowerOff className="w-4 h-4" />Encerrar viagem</button>

          {/* Concluir Viagem Button (Requirement #7) */}
          <button
            onClick={() => setShowCompletionDialog(true)}
            className="py-2.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Concluir Viagem</span>
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


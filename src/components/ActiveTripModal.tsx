import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { TripPlan, Vehicle, Achievement } from '../types';
import { InteractiveMap } from './InteractiveMap';
import { 
  Navigation, 
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
  trip: TripPlan;
  vehicle: Vehicle;
  isOpen: boolean;
  onClose: () => void;
  onCompleteTrip: (tripId: string, actualKm: number, verifiedGps: boolean) => { newAchievements: Achievement[]; leveledUp: boolean };
  onOpenSos: () => void;
  onReturnHome: () => void;
}

export const ActiveTripModal: React.FC<ActiveTripModalProps> = ({
  trip,
  vehicle,
  isOpen,
  onClose,
  onCompleteTrip,
  onOpenSos,
  onReturnHome
}) => {
  const [currentSpeed, setCurrentSpeed] = useState(78); // km/h simulated driving speed
  const [elapsedMinutes, setElapsedMinutes] = useState(15);
  const [distanceTraveledKm, setDistanceTraveledKm] = useState(Math.round(trip.distanceKm * 0.15));
  const [notifyArrival, setNotifyArrival] = useState(true);
  const [isGpsActive, setIsGpsActive] = useState(true);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [completionGpsVerified, setCompletionGpsVerified] = useState(true);
  const [unlockedCelebration, setUnlockedCelebration] = useState<Achievement[] | null>(null);

  // Speed simulation jitter
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentSpeed(prev => Math.max(45, Math.min(105, prev + Math.floor(Math.random() * 7) - 3)));
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const remainingKm = Math.max(0, trip.distanceKm - distanceTraveledKm);
  const nextStop = trip.stops[0];

  const handleFinish = () => {
    const res = onCompleteTrip(trip.id, trip.distanceKm, completionGpsVerified);
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
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
            <Navigation className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h2 className="text-sm font-extrabold text-slate-900 truncate max-w-[200px]">
                {trip.destinationName.split('-')[0].trim()}
              </h2>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {vehicle.nickname || vehicle.model} · {currentSpeed} km/h
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
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* MOTORCYCLE RAIN WEATHER ALERT IF APPLICABLE (Requirement #23) */}
      {trip.hasRainRisk && vehicle.type === 'motorcycle' && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 shrink-0" />
            <span>Alerta Piloto: Chuva e pista molhada prevista no trecho da serra. Mantenha distância do veículo à frente.</span>
          </div>
        </div>
      )}

      {/* MAP AND ROUTE CONTAINER */}
      <div className="flex-1 relative">
        <InteractiveMap 
          originCoords={trip.originCoords}
          destinationCoords={trip.destinationCoords}
          routePath={trip.routePath}
          stops={trip.stops}
          userLiveCoords={trip.routePath[1] || trip.originCoords}
          showRainLayer={trip.hasRainRisk}
          className="w-full h-full"
        />

        {/* FLOATING SPEEDOMETER - WHITE CARD OVERLAY */}
        <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
          <div className="p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl flex items-center gap-3">
            <div className="text-3xl font-black text-emerald-700 font-mono tabular-nums">
              {currentSpeed}
            </div>
            <div className="text-[10px] text-slate-500 uppercase font-extrabold leading-tight">
              KM/H<br />VELOCIDADE
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM NAVIGATION CONTROLS - WHITE MENU */}
      <div className="bg-white border-t border-slate-200 p-4 space-y-3 shrink-0 shadow-xl">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-bold block">RESTANTE</span>
            <strong className="text-sm font-extrabold text-slate-900">{remainingKm} km</strong>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] text-slate-500 font-bold block">TEMPO RESTANTE</span>
            <strong className="text-sm font-extrabold text-emerald-700">
              ~{Math.max(10, Math.round((remainingKm / 75) * 60))} min
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
          <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={notifyArrival}
              onChange={(e) => setNotifyArrival(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Avisar familiares ao chegar no destino</span>
          </label>

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
                    <strong className="text-slate-900 text-sm">{trip.distanceKm} km</strong>
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
                    checked={completionGpsVerified}
                    onChange={(e) => setCompletionGpsVerified(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-emerald-950 block">Distância verificada por GPS</span>
                    <span className="text-[11px] text-slate-600">
                      Computa como quilometragem auditada e oficial do viajante.
                    </span>
                  </div>
                </label>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setShowCompletionDialog(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleFinish}
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

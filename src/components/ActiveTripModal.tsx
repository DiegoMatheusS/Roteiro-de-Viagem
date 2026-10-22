import { RouteConditionsStatus,type ConditionsStatus } from './RouteConditionsStatus';
import React, { useEffect, useRef, useState } from 'react';
import type { CameraMode } from '../services/mapCameraController';
import confetti from 'canvas-confetti';
import { TripPlan, Vehicle, Achievement, ConvoyParticipant, MeetingPoint } from '../types';
import { InteractiveMap } from './InteractiveMap';
import { Speedometer } from './Speedometer';
import { VoiceGuidanceControl } from './VoiceGuidanceControl';
import '../role-navigation-figma.css';
import {useMapAppearance} from '../hooks/useMapAppearance';
import { nextNavigationGuidance } from '../services/navigationGuidance';
import { useAutoReroute } from '../hooks/useAutoReroute';
import { isGpsOutsideRouteCorridor,eligibleAutomaticReroute,remainingRerouteStops,routeNeedsRefreshAfterStop,canEditStopsWhileStationary,canConfirmStopManually,requestAutomaticReroute,type ReroutedNavigation } from '../services/autoReroute';
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
  Share2,
  ShieldAlert,
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
  onOpenShareModal: (trip:TripPlan) => void;
  onReturnHome: () => void;
  onNavigationReroute: (next:ReroutedNavigation)=>void;
  onStopVisited: (id:string)=>void;
  onManualStopComplete: (id:string)=>boolean;
  onSkipStop: (id:string,next:ReroutedNavigation,expectedVersion:string)=>boolean;
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
  onOpenShareModal,
  onReturnHome,
  onNavigationReroute,
  onStopVisited,
  onManualStopComplete,
  onSkipStop
}) => {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [showRouteDetails,setShowRouteDetails] = useState(false);
  const [stopDecision,setStopDecision]=useState<'complete'|'skip'|null>(null);
  const [stopBusy,setStopBusy]=useState(false);
  const [stopError,setStopError]=useState<string|null>(null);
  const [stopNotice,setStopNotice]=useState<string|null>(null);
  const stopController=useRef<AbortController|null>(null);
  useEffect(()=>{
    return ()=>{
      stopController.current?.abort();
      stopController.current=null;
    };
  },[isOpen,trip.id]);
  const {theme:appearanceTheme}=useMapAppearance();
  const [centerRequest,setCenterRequest] = useState(0);
  const [cameraMode,setCameraMode]=useState<CameraMode>('following');
  useEffect(()=>{if(!isOpen)setCameraMode('following');},[isOpen,trip.id]);
  const [manualCompletion, setManualCompletion] = useState(false);
  const [manualDistance, setManualDistance] = useState('');
  const [unlockedCelebration, setUnlockedCelebration] = useState<Achievement[] | null>(null);
  const rerouted=trip.navigationReroute;
  const navigationPath=rerouted?.routePath||trip.routePath;
  const navigationSteps=rerouted?.routeSteps||trip.routeSteps;
  const distanceTraveledKm=tracking.distanceKm;
  const routeTravelledKm=rerouted?Math.max(0,distanceTraveledKm-rerouted.trackedAtKm):distanceTraveledKm;
  const routeDistanceKm=rerouted?.distanceKm||trip.distanceKm;
  const outstandingStops=trip.stops.filter(stop=>!trip.navigationVisitedStopIds?.includes(stop.id)&&
    !trip.navigationSkippedStopIds?.includes(stop.id));
  const pendingStopMinutes=outstandingStops.reduce((sum,stop)=>
    sum+Math.max(0,stop.recommendedMinutes||0),0);
  const plannedStopMinutes=trip.stops.reduce((sum,stop)=>
    sum+Math.max(0,stop.recommendedMinutes||0),0);
  const drivingMinutes=rerouted?.drivingMinutes||trip.drivingMinutes||
    Math.max(0,trip.durationMinutes-plannedStopMinutes);
  const remainingKm=Math.max(0,routeDistanceKm-routeTravelledKm);
  const remainingMinutes=Math.max(0,Math.round(
    remainingKm/Math.max(routeDistanceKm,0.001)*drivingMinutes+pendingStopMinutes));
  const roadAlerts = useRoadAlerts(navigationPath);
  const rerouteNotice=useAutoReroute({trip,
    position:isOpen&&tracking.status==='ready'?tracking.position:null,
    trackedDistanceKm:distanceTraveledKm,
    enabled:isOpen,onReroute:onNavigationReroute,onStopVisited});

  if (!isOpen) return null;

  const currentSpeed = tracking.speedKmH;
  const isGpsActive = tracking.status === 'ready';
  const outsideCorridor=isGpsActive&&isGpsOutsideRouteCorridor(tracking.position,navigationPath);
  const refreshingStopRoute=routeNeedsRefreshAfterStop(trip);
  // The last verified line remains on screen while a newly attended stop
  // changes the itinerary. Never voice turns based on its old waypoint list.
  const nextTurn = (outsideCorridor||refreshingStopRoute)?null:nextNavigationGuidance(navigationPath,navigationSteps,
    isGpsActive ? tracking.position?.coords : undefined,routeTravelledKm,routeDistanceKm);
  const completionGpsVerified = !manualCompletion && distanceTraveledKm > 0;
  const actualKm = completionGpsVerified ? distanceTraveledKm : Number(manualDistance.replace(',', '.'));
  const canFinish = Number.isFinite(actualKm) && actualKm > 0;
  const nextStop = outstandingStops[0];
  const canEditStopped=canEditStopsWhileStationary(isGpsActive?tracking.position:null);
  const pendingVerified=remainingRerouteStops(trip);
  const nextVerified=pendingVerified?.[0];
  const canManageNext=!!nextStop&&nextVerified?.id===nextStop.id&&
    eligibleAutomaticReroute(trip);
  const canMarkNext=canManageNext&&!!nextStop&&canConfirmStopManually(trip,nextStop.id,
    isGpsActive?tracking.position:null);
  const canSkipNext=canManageNext&&canEditStopped;
  const cancelStopDecision=()=>{
    stopController.current?.abort();
    stopController.current=null;
    setStopBusy(false);
    setStopDecision(null);
    setStopError(null);
  };
  const confirmStopDecision=async()=>{
    if(!stopDecision||!nextStop)return;
    const targetId=nextStop.id;
    setStopError(null);
    if(stopDecision==='complete'){
      if(!canMarkNext||!onManualStopComplete(targetId)){
        setStopError('Aproxime-se da parada com GPS preciso e veículo parado.');
        return;
      }
      setStopNotice('Parada concluída manualmente. O restante do roteiro foi preservado.');
      setStopDecision(null);
      return;
    }
    if(!canSkipNext||!tracking.position||stopController.current)return;
    const controller=new AbortController();
    stopController.current=controller;
    setStopBusy(true);
    const routeVersion=trip.navigationReroute?.updatedAt||'original';
    try{
      const proposal={...trip,navigationSkippedStopIds:[
        ...(trip.navigationSkippedStopIds||[]),targetId]};
      const next=await requestAutomaticReroute(proposal,tracking.position.coords,
        tracking.distanceKm,controller.signal);
      if(controller.signal.aborted)return;
      if(!onSkipStop(targetId,next,routeVersion)){
        setStopError('A viagem mudou durante o cálculo. Confira a parada e tente novamente.');
        return;
      }
      setStopDecision(null);
      setStopNotice('Parada ignorada. O novo trajeto foi confirmado com as demais paradas.');
    }catch(error){
      if(!controller.signal.aborted){
        setStopError('Não foi possível confirmar uma nova rota. A parada e o trajeto anterior foram mantidos.');
        void error;
      }
    }finally{
      if(stopController.current===controller)stopController.current=null;
      if(!controller.signal.aborted)setStopBusy(false);
    }
  };

  const upcoming = tracking.status === 'ready'
    ? upcomingRoadAlert(roadAlerts.alerts, navigationPath, tracking.position?.coords, routeTravelledKm, routeDistanceKm)
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
    <div className="rdv-nav-figma-root" data-role-theme={appearanceTheme} aria-label="Navegação GPS ativa">
      {/* O mapa continua vivo e ocupando a tela toda; a UI não intercepta os gestos. */}
      <div className="rdv-nav-figma-map rdv-flat-map">
        <InteractiveMap convoyParticipants={convoyParticipants} meetingPoints={meetingPoints}
          originCoords={rerouted?.originCoords||trip.originCoords} destinationCoords={trip.destinationCoords}
          routePath={navigationPath} navigationMode roadStyle
          maneuverMeters={nextTurn&&nextTurn.direction!=='straight'?nextTurn.meters:null}
          onCameraModeChange={setCameraMode}
          travelledDistanceKm={routeTravelledKm} totalRouteKm={routeDistanceKm}
          stops={outstandingStops} weatherPoints={rerouted?[]:trip.weatherPoints} roadAlerts={roadAlerts.alerts}
          centerOnUserRequest={centerRequest} tolls={rerouted?[]:trip.tolls||[]}
          tollVehicleType={vehicle.type}
          userLiveCoords={isGpsActive ? tracking.position?.coords:undefined}
          userGpsAccuracyMeters={isGpsActive?tracking.position?.accuracyMeters:undefined}
          userHeadingDegrees={isGpsActive ? tracking.position?.headingDegrees : null}
          userSpeedMetersPerSecond={isGpsActive?tracking.position?.speedMetersPerSecond:null}
          showRainLayer={!rerouted&&trip.hasRainRisk}
          className="w-full h-full"/>
      </div>

      <div role="status" aria-label="Próxima orientação de navegação"
        className="rdv-nav-guidance">
        <span aria-hidden="true" className="rdv-nav-guidance-icon">
          {nextTurn?.direction==='left'?<CornerUpLeft size={34} strokeWidth={1.5}/>:
            nextTurn?.direction==='right'?<CornerUpRight size={34} strokeWidth={1.5}/>:
            nextTurn?.direction==='roundabout'?<RotateCcw size={34} strokeWidth={1.5}/>:
            nextTurn?.direction==='arrive'?<MapPin size={33} strokeWidth={1.5}/>:
            <ArrowUp size={35} strokeWidth={1.5}/>}
        </span>
        <span className="rdv-nav-guidance-copy">
          <strong>{nextTurn?
            (nextTurn.meters>=1000?`${(nextTurn.meters/1000).toFixed(1).replace('.',',')} km`:`${nextTurn.meters} m`):
            isGpsActive?(outsideCorridor?'Fora da rota':refreshingStopRoute?'Parada atendida':'Na rota'):'Aguardando GPS'}</strong>
          <span>{nextTurn?<>
            <span>{nextTurn.direction==='right'?'À direita':nextTurn.direction==='left'?'À esquerda':
              nextTurn.direction==='roundabout'?'Na rotatória':
              nextTurn.direction==='arrive'?'Chegando ao destino':'Siga em frente'}</span>
            {nextTurn.road&&<> na <span>{nextTurn.road}</span></>}
          </>:isGpsActive?(refreshingStopRoute?'Atualizando trajeto para as paradas restantes':outsideCorridor?(eligibleAutomaticReroute(trip)?'Aguardando recálculo rodoviário':'Siga com atenção · recálculo indisponível'):'Siga a rota'):'Ative a localização para receber instruções'}</span>
        </span>
      </div>
      <div className="rdv-nav-gps-status" aria-live="polite">
        <span aria-hidden="true">ⓘ</span>
        {isGpsActive?'GPS ativo · localização ao vivo':
          tracking.error?'GPS indisponível · tente novamente':'Aguardando sinal de GPS'}
        {refreshingStopRoute?' · Rota anterior mantida até atualizar':''}
        {rerouteNotice==='recalculating'?' · Recalculando rota...':
          rerouteNotice==='updated'?' · Rota atualizada':
          rerouteNotice==='unavailable'?' · Rota anterior mantida':''}
      </div>
      {tracking.error&&<button type="button" onClick={tracking.retry}
        className="rdv-nav-retry">Tentar GPS novamente</button>}
      {!rerouted&&(trip.hasRainRisk||trip.weatherPoints.some(p=>p.warning))&&vehicle.type==='motorcycle'&&
        <div className="rdv-nav-rain-warning" role="status">
          <CloudRain size={17}/> Atenção: condições de chuva no percurso.
        </div>}

      {upcoming&&<div role="status" className="rdv-nav-upcoming-alert">
        {ROAD_ALERT_TYPES.find(type=>type.id===upcoming.alert.kind)?.label} · ~{upcoming.distanceKm.toFixed(1)} km à frente
      </div>}

      <div className="rdv-nav-left-controls">
        <Speedometer position={isGpsActive?tracking.position:null}/>
      </div>
      <div className="rdv-nav-right-controls">
        <VoiceGuidanceControl guidance={nextTurn}/>
        <button type="button" aria-label="Centralizar mapa na minha localização"
          title={cameraMode==='exploring'?'Voltar a seguir o GPS':'Centralizar GPS'}
          onClick={()=>setCenterRequest(v=>v+1)} disabled={!isGpsActive}
          className="rdv-nav-map-button">
          <LocateFixed size={21} strokeWidth={1.9}/><span>Centrar</span>
        </button>
      </div>

      {/* Painel inferior da referência: ETA calculada, distância restante e três ações. */}
      <div className="rdv-nav-bottom">
        <div className="rdv-nav-trip-progress">
          <div className="rdv-nav-left-stat">
            <strong>{remainingMinutes} min</strong>
            <span>{remainingKm.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} km {refreshingStopRoute?'estimados · atualizando rota':'restantes'}</span>
          </div>
          <button type="button" aria-label="Detalhes de clima e pedágios"
            aria-expanded={showRouteDetails} onClick={()=>setShowRouteDetails(v=>!v)}
            className="rdv-nav-eta-stat" title="Ver clima, pedágios e opções da viagem">
            <strong>{new Date(Date.now()+
              remainingMinutes*60000)
              .toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong>
            <span>{trip.isCircular?'de volta ao início':'chegada prevista'}</span>
          </button>
        </div>
        <div className="rdv-nav-bottom-actions">
          <button type="button" aria-label="Encerrar viagem" onClick={()=>setShowEndConfirm(true)}
            className="rdv-nav-bottom-button">
            <PowerOff size={16}/> <span>Encerrar</span>
          </button>
          <button type="button" onClick={()=>onOpenShareModal(trip)}
            className="rdv-nav-bottom-button">
            <Share2 size={16}/> <span>Compartilhar</span>
          </button>
          <button type="button" onClick={onOpenSos} aria-label="SOS"
            className="rdv-nav-bottom-button rdv-nav-sos">
            <ShieldAlert size={16}/> <span>SOS</span>
          </button>
        </div>
      </div>

      {showRouteDetails&&<div role="region" aria-label="Opções e condições do trajeto"
        className="rdv-nav-extra-panel">
        <div className="rdv-nav-extra-heading">
          <strong>Detalhes do trajeto</strong>
          <button type="button" aria-label="Fechar detalhes da rota"
            onClick={()=>setShowRouteDetails(false)}><ChevronDown size={17}/></button>
        </div>
        <RouteConditionsStatus trip={trip} conditions={conditions}/>
        {rerouted&&<p className="text-xs text-amber-800">Os dados de clima, combustível e pedágios do roteiro original podem estar desatualizados após o recálculo.</p>}
        {nextStop&&<p className="text-xs text-slate-700">Próxima parada: {nextStop.name}</p>}
        {!!trip.navigationVisitedStopIds?.length&&<p className="text-xs text-emerald-800">
          {trip.navigationVisitedStopIds.length} parada(s) concluída(s)
          {trip.navigationManualStopIds?.length?' (inclui conclusão manual)':''}
        </p>}
        {!!trip.navigationSkippedStopIds?.length&&<p className="text-xs text-amber-800">
          {trip.navigationSkippedStopIds.length} parada(s) ignorada(s)
        </p>}
        {stopNotice&&<p role="status" className="text-xs text-emerald-800">{stopNotice}</p>}
        {!!nextStop&&<div className="rdv-nav-stop-actions" aria-label="Gerenciar próxima parada">
          <p className="text-xs text-slate-700">Alterações somente com veículo parado e GPS recente.</p>
          <button type="button" className="rdv-nav-extra-action" disabled={!canMarkNext}
            onClick={()=>{setStopNotice(null);setStopError(null);setStopDecision('complete');}}>
            Concluir parada
          </button>
          <button type="button" className="rdv-nav-extra-action" disabled={!canSkipNext}
            onClick={()=>{setStopNotice(null);setStopError(null);setStopDecision('skip');}}>
            Pular parada
          </button>
          {!canEditStopped&&<p className="text-xs text-amber-800">
            Pare em local seguro para habilitar as alterações.
          </p>}
          {canEditStopped&&!canManageNext&&<p className="text-xs text-amber-800">
            Este roteiro não permite alterar paradas automaticamente.
          </p>}
        </div>}
        <div className="rdv-nav-extra-buttons">
          <div className="min-w-0"><RoadAlertReporter
            location={isGpsActive?tracking.position:null} speedKmH={currentSpeed}
            onSubmitted={()=>{void roadAlerts.reload();}}/></div>
          <button type="button" onClick={()=>setShowHomeConfirm(true)}
            className="rdv-nav-extra-action"><Home size={17}/> Traçar rota para casa</button>
          <button type="button" onClick={()=>setShowCompletionDialog(true)}
            className="rdv-nav-extra-action"><CheckCircle size={17}/> Concluir Viagem</button>
        </div>
      </div>}
      {stopDecision&&nextStop&&<div role="dialog" aria-modal="true"
        aria-label={stopDecision==='skip'?'Pular parada':'Concluir parada'}
        className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white text-slate-900 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
          <h3 className="font-bold">{stopDecision==='skip'?'Pular esta parada?':'Confirmar parada concluída?'}</h3>
          <p className="text-sm text-slate-700">{nextStop.name}</p>
          <p className="text-xs text-slate-600">
            {stopDecision==='skip'
              ?'O Rolê calculará uma rota rodoviária sem esta parada, mantendo as demais. Se não conseguir confirmar, o trajeto e as paradas continuarão como estão.'
              :'Registra a conclusão manual. Você precisa estar próximo da parada, com GPS preciso e veículo parado.'}
          </p>
          {stopError&&<p role="alert" className="text-xs text-red-700">{stopError}</p>}
          <div className="flex gap-3">
            <button type="button" className="p-3 border rounded-xl flex-1"
              onClick={cancelStopDecision}>Cancelar</button>
            <button type="button" className="p-3 bg-blue-700 text-white rounded-xl flex-1"
              disabled={stopBusy||!(stopDecision==='skip'?canSkipNext:canMarkNext)}
              onClick={()=>void confirmStopDecision()}>
              {stopBusy?'Recalculando...':stopDecision==='skip'?'Recalcular sem parada':'Confirmar chegada'}
            </button>
          </div>
        </div>
      </div>}
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


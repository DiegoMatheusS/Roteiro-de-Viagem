import { useEffect, useRef, useState } from 'react';
import { createGpsTrackingState, recordGpsPosition } from '../services/gpsTracking';
import { storageService } from '../services/storageService';
import { isNativeApp, TravelNative } from '../services/nativeApp';
import type { DeviceLocation } from '../services/locationService';
import { useDeviceLocation } from './useDeviceLocation';
import { activeNativeTripPosition } from '../services/activeNativeTripPosition';
import { gpsStoppedByNotification,mergeNativeTrackingState } from '../services/nativeTrackingState';
import { whilePageVisible } from '../services/whilePageVisible';
export function useTripTracking(tripId?: string) {
  const native = isNativeApp();
  const nativeKey = tripId ? `${storageService.getScope() || 'guest'}:${tripId}` : '';
  const location = useDeviceLocation(!!tripId && !native, tripId);
  const [nativeState, setNativeState] = useState<{ tripId?: string; distanceKm: number; position: DeviceLocation | null; error: string | null; running: boolean;stoppedByUser:boolean;deviceHeadingDegrees?:number|null }>({ distanceKm: 0, position: null, error: null, running: false, stoppedByUser:false });
  const [attempt, setAttempt] = useState(0);
  const lastNativeFix=useRef<{key:string;position:DeviceLocation}|null>(null);
  const initial = () => ({ tripId, ...createGpsTrackingState(), distanceKm: storageService.getActiveTrip()?.id === tripId ? storageService.getActiveTrip()?.trackedDistanceKm || 0 : 0 });
  const [tracking, setTracking] = useState(initial);
  useEffect(() => {
    if (!native) return;
    if (!tripId) { void TravelNative.stopTracking().catch(() => {}); return; }
    let disposed = false, ready = false;
    setNativeState({ tripId, distanceKm: storageService.getActiveTrip()?.trackedDistanceKm || 0, position: null, error: null, running: false, stoppedByUser:false });
    let inFlight=false;
    const read = () => { if (!ready || document.hidden || disposed || inFlight) return;
      inFlight=true;
      void TravelNative.state().then(state => {
      if(disposed)return;
      const stoppedByUser=gpsStoppedByNotification(state,nativeKey);
      if(state.tripId!==nativeKey){setNativeState(current=>({...current,position:null,running:false,stoppedByUser,distanceKm:state.lastTripId===nativeKey?Math.max(current.distanceKm,state.distanceKm):current.distanceKm,error:'GPS interrompido. Toque em tentar novamente para retomá-lo.'}));return;}
      const livePosition=activeNativeTripPosition(state,nativeKey);
      // Skip the render when the poll brought nothing new (see mergeNativeTrackingState).
      setNativeState(current => mergeNativeTrackingState(current, { tripId, distanceKm: state.distanceKm, position: livePosition, running: state.running, stoppedByUser,
        deviceHeadingDegrees:livePosition?state.deviceHeadingDegrees??null:null,
        error: !state.running ? 'GPS interrompido. Toque em tentar novamente para retomá-lo.' : !livePosition ? 'Aguardando sinal GPS recente.' : null }));
    }).catch(error => { if (!disposed) setNativeState(current => ({ ...current, error: error.message })); })
      .finally(()=>{inFlight=false;}); };
    void TravelNative.startTracking({ tripId: nativeKey, distanceKm: storageService.getActiveTrip()?.trackedDistanceKm || 0, resume:attempt>0 }).then(() => { ready = true; read(); }).catch(error => { if (!disposed) { setNativeState(current => ({ ...current, error: error.message })); ready = true; read(); } });
    // Polling curto deixa a seta acompanhar os updates do serviço Android sem
    // aguardar os antigos 2 s; mudança só de azimute preserva o fix GPS.
    const stopPolling=whilePageVisible(()=>{read();const timer=window.setInterval(read,250);return()=>clearInterval(timer);});
    return () => { disposed = true; stopPolling(); void TravelNative.stopTracking().catch(() => {}); };
  }, [native, tripId, nativeKey, attempt]);
  useEffect(() => {
    if (native) return;
    setTracking(current => {
      const base = current.tripId === tripId ? current : initial();
      if (location.status !== 'ready') return { ...base, lastPosition: null };
      return location.position ? { tripId, ...recordGpsPosition(base, location.position) } : base;
    });
  }, [tripId, location.position, location.status, native]);
  const distanceKm = native ? nativeState.tripId === tripId ? nativeState.distanceKm : 0 : tracking.tripId === tripId ? tracking.distanceKm : 0;
  useEffect(() => {
    if (!tripId) return;
    const persist = () => { const active = storageService.getActiveTrip(); if (active?.id === tripId && distanceKm > (active.trackedDistanceKm || 0)) storageService.setActiveTrip({ ...active, trackedDistanceKm: distanceKm }); };
    const timer = window.setTimeout(persist, 2000); return () => { clearTimeout(timer); persist(); };
  }, [tripId, distanceKm]);
  const position = native ? activeNativeTripPosition(nativeState,tripId) : location.position;
  const status = native ? !tripId ? 'idle' as const : position ? 'ready' as const : nativeState.error ? 'error' as const : 'loading' as const : location.status;
  // Retain a visual reference only. Guidance, distance and speed still receive
  // exclusively the fresh position and the running trip's status.
  if(lastNativeFix.current?.key!==nativeKey||!tripId)lastNativeFix.current=null;
  if(native&&position)lastNativeFix.current={key:nativeKey,position};
  const lastKnownPosition=native?lastNativeFix.current?.position??null:location.lastKnownPosition;
  return { position, lastKnownPosition, status, deviceHeadingDegrees:native&&status==='ready'?nativeState.deviceHeadingDegrees??null:null,
    error: native ? nativeState.error : location.error, gpsStoppedByUser:native&&nativeState.tripId===tripId&&nativeState.stoppedByUser, retry: native ? () => setAttempt(v => v + 1) : location.retry, distanceKm,
    speedKmH: status === 'ready' && position?.speedMetersPerSecond != null ? Math.round(position.speedMetersPerSecond * 3.6) : null };
}

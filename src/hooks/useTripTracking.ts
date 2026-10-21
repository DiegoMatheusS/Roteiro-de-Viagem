import { useEffect, useState } from 'react';
import { createGpsTrackingState, recordGpsPosition } from '../services/gpsTracking';
import { storageService } from '../services/storageService';
import { isNativeApp, TravelNative } from '../services/nativeApp';
import type { DeviceLocation } from '../services/locationService';
import { useDeviceLocation } from './useDeviceLocation';
import { isFreshGpsFix } from '../services/gpsFreshness';
export function useTripTracking(tripId?: string) {
  const native = isNativeApp();
  const nativeKey = tripId ? `${storageService.getScope() || 'guest'}:${tripId}` : '';
  const location = useDeviceLocation(!!tripId && !native, tripId);
  const [nativeState, setNativeState] = useState<{ tripId?: string; distanceKm: number; position: DeviceLocation | null; error: string | null; running: boolean }>({ distanceKm: 0, position: null, error: null, running: false });
  const [attempt, setAttempt] = useState(0);
  const initial = () => ({ tripId, ...createGpsTrackingState(), distanceKm: storageService.getActiveTrip()?.id === tripId ? storageService.getActiveTrip()?.trackedDistanceKm || 0 : 0 });
  const [tracking, setTracking] = useState(initial);
  useEffect(() => {
    if (!native) return;
    if (!tripId) { void TravelNative.stopTracking().catch(() => {}); return; }
    let disposed = false, ready = false;
    setNativeState({ tripId, distanceKm: storageService.getActiveTrip()?.trackedDistanceKm || 0, position: null, error: null, running: false });
    const read = () => { if (!ready) return; void TravelNative.state().then(state => {
      if(disposed)return;
      if(state.tripId!==nativeKey){setNativeState(current=>({...current,position:null,running:false,distanceKm:state.lastTripId===nativeKey?Math.max(current.distanceKm,state.distanceKm):current.distanceKm,error:'GPS interrompido. Toque em tentar novamente para retomá-lo.'}));return;}
      const fresh = !!state.position && isFreshGpsFix(state.position.timestamp);
      setNativeState({ tripId, distanceKm: state.distanceKm, position: fresh ? state.position! : null, running: state.running,
        error: !state.running ? 'GPS interrompido. Toque em tentar novamente para retomá-lo.' : !fresh ? 'Aguardando sinal GPS recente.' : null });
    }).catch(error => { if (!disposed) setNativeState(current => ({ ...current, error: error.message })); }); };
    void TravelNative.startTracking({ tripId: nativeKey, distanceKm: storageService.getActiveTrip()?.trackedDistanceKm || 0, resume:attempt>0 }).then(() => { ready = true; read(); }).catch(error => { if (!disposed) setNativeState(current => ({ ...current, error: error.message })); });
    const timer = window.setInterval(read, 2000);
    return () => { disposed = true; clearInterval(timer); void TravelNative.stopTracking().catch(() => {}); };
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
  const position = native ? nativeState.position : location.position;
  const status = native ? !tripId ? 'idle' as const : position ? 'ready' as const : nativeState.error ? 'error' as const : 'loading' as const : location.status;
  return { position, status, error: native ? nativeState.error : location.error, retry: native ? () => setAttempt(v => v + 1) : location.retry, distanceKm,
    speedKmH: status === 'ready' && position?.speedMetersPerSecond != null ? Math.round(position.speedMetersPerSecond * 3.6) : null };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import type { RoadAlert, RoadAlertType } from '../types/roadAlerts';
import type { DeviceLocation } from '../services/locationService';
import { sampleRoutePath } from '../types/itinerary';

export function useRoadAlerts(routePath: [number, number][]) {
  const key = JSON.stringify(sampleRoutePath(routePath, 1000));
  const [view, setView] = useState<{key:string; alerts:RoadAlert[]; error:string}>({
    key, alerts: [], error: ''
  });
  const currentKey = useRef(key);
  currentKey.current = key;
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    activeRequest.current?.abort();
    const path = JSON.parse(key) as [number, number][];
    if (path.length < 2) {
      activeRequest.current = null;
      setView({key, alerts: [], error: ''});
      return;
    }
    if (signal?.aborted) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    try {
      const result = await fuelApi<{alerts:RoadAlert[]}>('/road-alerts/route', {
        method:'POST', body:JSON.stringify({routePath:path}), signal:controller.signal
      });
      if (!controller.signal.aborted && id === requestId.current && key === currentKey.current) {
        setView({key, alerts:Array.isArray(result.alerts)?result.alerts:[], error:''});
      }
    } catch (error) {
      if (!controller.signal.aborted && id === requestId.current && key === currentKey.current) {
        setView(previous => ({
          key, alerts:previous.key === key ? previous.alerts : [], error:(error as Error).message
        }));
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  },[key]);

  useEffect(() => {
    const controller = new AbortController();
    // A changed route must not display a previous journey's road hazards.
    setView({key, alerts:[], error:''});
    void reload(controller.signal);
    const interval = window.setInterval(() => {
      if (!document.hidden) void reload(controller.signal);
    }, 2 * 60000);
    // A hidden tab may have missed the polling window. Refresh on resume
    // rather than leaving expired/revoked alerts on the map for two minutes.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload(controller.signal);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [reload,key]);

  return {
    alerts: view.key === key ? view.alerts : [],
    error: view.key === key ? view.error : '',
    reload
  };
}
export async function submitRoadAlert(
  kind: RoadAlertType, location: DeviceLocation, note = ''
) {
  if (location.accuracyMeters > 80 || Date.now() - location.timestamp > 60000 || location.timestamp > Date.now() + 5000)
    throw new Error('O GPS precisa estar preciso e atualizado para informar a ocorrência.');
  return fuelApi<{id:string;status:string;message:string}>('/road-alerts', {
    method: 'POST',
    body: JSON.stringify({kind, coords:location.coords, note,
      accuracyMeters:location.accuracyMeters, locationTimestamp:location.timestamp})
  });
}

/** Um voto por pessoa; a API exige posição recente próxima ao marcador. */
export async function confirmRoadAlert(id: string, present: boolean, location: DeviceLocation) {
  if (location.speedMetersPerSecond != null && location.speedMetersPerSecond * 3.6 > 5)
    throw new Error('Pare em um local seguro antes de confirmar a ocorrência.');
  if (location.accuracyMeters > 80 || Date.now() - location.timestamp > 60000 ||
      location.timestamp > Date.now() + 5000)
    throw new Error('O GPS precisa estar preciso e atualizado para confirmar.');
  return fuelApi<{ok:boolean;removed:boolean;yes:number;no:number}>(`/road-alerts/${encodeURIComponent(id)}/confirm`, {
    method: 'POST', body: JSON.stringify({
      present, coords:location.coords, accuracyMeters:location.accuracyMeters,
      locationTimestamp:location.timestamp
    })
  });
}

import { useCallback, useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import type { RoadAlert, RoadAlertType } from '../types/roadAlerts';
import type { DeviceLocation } from '../services/locationService';
import { sampleRoutePath } from '../types/itinerary';

export function useRoadAlerts(routePath: [number, number][]) {
  const [alerts, setAlerts] = useState<RoadAlert[]>([]);
  const [error, setError] = useState('');
  const key = JSON.stringify(sampleRoutePath(routePath, 1000));
  const reload = useCallback(async (signal?: AbortSignal) => {
    if (routePath.length < 2) { setAlerts([]); return; }
    try {
      const result = await fuelApi<{alerts: RoadAlert[]}>('/road-alerts/route', {
        method: 'POST', body: JSON.stringify({routePath: sampleRoutePath(routePath, 1000)}), signal
      });
      if (!signal?.aborted) { setAlerts(result.alerts); setError(''); }
    } catch (e) { if (!signal?.aborted) setError((e as Error).message); }
  }, [key]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const timer = window.setInterval(() => { if (!document.hidden) void reload(controller.signal); }, 2 * 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [reload]);
  return {alerts, error, reload};
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

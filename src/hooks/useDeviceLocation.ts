import { useCallback, useEffect, useState } from 'react';
import { watchDeviceLocation, type DeviceLocation } from '../services/locationService';

type LocationStatus = 'idle' | 'loading' | 'ready' | 'error' | 'stale';

export function useDeviceLocation(enabled: boolean, sessionKey = '') {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ position: DeviceLocation | null; error: string | null; status: LocationStatus; key: string }>({
    position: null, error: null, status: 'idle', key: sessionKey
  });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    setState({ position: null, error: null, status: enabled ? 'loading' : 'idle', key: sessionKey });
    if (!enabled) return;
    const geolocation = navigator.geolocation;
    if (!geolocation) {
      setState({ position: null, error: 'Este dispositivo não disponibilizou o GPS.', status: 'error', key: sessionKey });
      return;
    }
    const stop = watchDeviceLocation(geolocation, position => {
      const fresh = Date.now() - position.timestamp <= 60000;
      setState({ position, error: fresh ? null : 'O sinal do GPS está desatualizado. Tente novamente.', status: fresh ? 'ready' : 'stale', key: sessionKey });
    }, error => setState({ position: null, error, status: 'error', key: sessionKey }));
    const timer = window.setInterval(() => setState(current => {
      if (current.status === 'ready' && current.position && Date.now() - current.position.timestamp > 60000) {
        return { ...current, status: 'stale', error: 'O sinal do GPS está desatualizado. Tente novamente.' };
      }
      return current;
    }), 1000);
    return () => { stop(); window.clearInterval(timer); };
  }, [enabled, sessionKey, attempt]);

  const current = enabled && state.key === sessionKey ? state : { position: null, error: null, status: 'idle' as const };
  return { ...current, retry };
}

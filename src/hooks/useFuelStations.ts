import { useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import type { FuelStation } from '../types/fuel';

export function useFuelStations(points: [number, number][], enabled = true) {
  const key = JSON.stringify(points);
  const [attempt, setAttempt] = useState(0);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !points.length) { setStations([]); return; }
    const controller = new AbortController();
    setLoading(true); setError(null); setStations([]);
    fuelApi<{ stations: FuelStation[]; mapUnavailable: boolean }>('/stations/search', { method: 'POST', body: JSON.stringify({ points: sampleRoutePath(points) }), signal: controller.signal })
      .then(result => { setStations(result.stations); if (result.mapUnavailable) setError('Exibindo postos já consultados. O mapa não pôde ser atualizado agora.'); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, enabled, attempt]);
  return { stations, error, loading, retry: () => setAttempt(value => value + 1) };
}

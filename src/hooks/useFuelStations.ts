import { useEffect, useMemo, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import type { FuelStation } from '../types/fuel';

// Evita consultas idênticas em sequência quando o GPS atualiza ou o usuário
// seleciona rotas. Consulta de postos é complementar, nunca um requisito da navegação.
const cache = new Map<string,{stations:FuelStation[];error:string|null;until:number}>();
const OK_TTL = 120_000;
const FAILURE_BACKOFF = 180_000;
export function useFuelStations(points: [number, number][], enabled = true) {
  const key = JSON.stringify(sampleRoutePath(points));
  const [attempt, setAttempt] = useState(0);
  const initial = useMemo(() => cache.get(key),[key]);
  const [stations, setStations] = useState<FuelStation[]>(initial?.stations || []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !points.length) { setStations([]); setError(null); setLoading(false); return; }
    const cached = cache.get(key);
    if (attempt === 0 && cached && cached.until > Date.now()) {
      setStations(cached.stations); setError(null); setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);setError(null);
    // Preserve markers already obtained while refreshing. Do not flash the map empty.
    fuelApi<{ stations: FuelStation[]; mapUnavailable: boolean }>('/stations/search', {
      method:'POST',body:JSON.stringify({points:sampleRoutePath(points)}),signal:controller.signal
    }).then(result => {
      if (controller.signal.aborted) return;
      const found=Array.isArray(result.stations)?result.stations:[];
      setStations(found);
      cache.set(key,{stations:found,error:null,until:Date.now()+OK_TTL});
      if(cache.size>40)cache.delete(cache.keys().next().value!);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      const detail=(failure as Error).message;
      cache.set(key,{stations:cached?.stations || [],error:detail,until:Date.now()+FAILURE_BACKOFF});
      setError(detail);
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  // Key already represents the sampled points. Retry forces another lookup.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,enabled,attempt]);
  return { stations, error, loading, retry: () => setAttempt(value => value + 1) };
}

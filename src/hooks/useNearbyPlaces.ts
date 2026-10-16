import { useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import type { Place } from '../types/admin';

export function useNearbyPlaces(points: [number, number][], enabled: boolean) {
  const key = JSON.stringify(points);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    if (!enabled || !points.length) { setPlaces([]); return; }
    const controller = new AbortController();
    setPlaces([]);
    const body = { points: sampleRoutePath(points) };
    void (async () => {
      try {
        const local = await fuelApi<{ places: Place[] }>('/places/search', { method: 'POST', body: JSON.stringify({ ...body, discover: false }), signal: controller.signal });
        if (controller.signal.aborted) return;
        setPlaces(local.places);
        const discovered = await fuelApi<{ places: Place[] }>('/places/search', { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
        if (!controller.signal.aborted) setPlaces(discovered.places);
      } catch { /* Retain the registered catalog when external maps are unavailable. */ }
    })();
    return () => controller.abort();
  }, [key, enabled]);
  return places;
}

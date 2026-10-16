import { useEffect, useState } from 'react';
import { fuelApi } from '../services/fuelApi';
import { sampleRoutePath } from '../types/itinerary';
import type { Place } from '../types/admin';

export function useNearbyPlaces(points: [number, number][], enabled: boolean) {
  const key = JSON.stringify(points);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    if (!enabled) { setPlaces([]); return; }
    const controller = new AbortController();
    setPlaces([]);
    fuelApi<{ places: Place[] }>('/places/search', { method: 'POST', body: JSON.stringify({ points: sampleRoutePath(points) }), signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPlaces(Array.isArray(result.places) ? result.places : []); }).catch(() => {});
    return () => controller.abort();
  }, [key, enabled]);
  return places;
}

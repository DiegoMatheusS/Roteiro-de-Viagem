import { useEffect, useRef, useState } from 'react';
import type { DeviceLocation } from '../services/locationService';
import { distanceMeters, resolveRoadSpeedLimit, type RoadWay } from '../services/roadSpeedLimit';

// Overpass/OSM disponibiliza limites explícitos cadastrados; falhas e dados ausentes
// ficam neutros. Não é fonte oficial nem substitui a sinalização da via.
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const MIN_REQUEST_INTERVAL_MS = 15000;
const MAX_READING_DISTANCE_METERS = 55;

type Reading = { coords: [number, number]; limit: number | null };
export function useRoadSpeedLimit(position: DeviceLocation | null): number | null {
  const [reading, setReading] = useState<Reading | null>(null);
  const currentRequest = useRef<AbortController | null>(null);
  const lastRequest = useRef<{ time: number; coords: [number, number] } | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => () => currentRequest.current?.abort(), []);

  const lat = position?.coords[0], lon = position?.coords[1];
  const accuracy = position?.accuracyMeters;
  useEffect(() => {
    const current = positionRef.current;
    if (!current || lat === undefined || lon === undefined || accuracy === undefined ||
        accuracy > 25 || Date.now() - current.timestamp > 15000) {
      setReading(null);
      return;
    }
    if (currentRequest.current) return;
    const previous = lastRequest.current;
    const now = Date.now();
    if (previous &&
        (now - previous.time < MIN_REQUEST_INTERVAL_MS ||
          (distanceMeters(previous.coords, [lat, lon]) < 70 && now - previous.time < 45000))) return;

    const coords: [number, number] = [lat, lon];
    const controller = new AbortController();
    currentRequest.current = controller;
    lastRequest.current = { time: now, coords };
    const query = '[out:json][timeout:8];way(around:50,' + lat + ',' + lon + ')["highway"];out tags geom;';
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    void fetch(OVERPASS_API + '?data=' + encodeURIComponent(query), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    }).then(async response => {
      if (!response.ok) throw new Error('Overpass indisponível');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('elements' in data) ||
          !Array.isArray(data.elements)) throw new Error('Resposta inválida do Overpass');
      const recent = positionRef.current;
      if (!recent || Date.now() - recent.timestamp > 15000) return;
      const limit = resolveRoadSpeedLimit(data.elements as RoadWay[], coords, accuracy);
      setReading({ coords, limit });
    }).catch(() => {
      if (!controller.signal.aborted) setReading({ coords, limit: null });
    }).finally(() => {
      window.clearTimeout(timeout);
      if (currentRequest.current === controller) currentRequest.current = null;
    });
  }, [lat, lon, accuracy, position?.timestamp]);

  if (!position || Date.now() - position.timestamp > 15000 ||
      !Number.isFinite(position.accuracyMeters) || position.accuracyMeters > 25 ||
      !reading || distanceMeters(position.coords, reading.coords) > MAX_READING_DISTANCE_METERS) return null;
  return reading.limit;
}

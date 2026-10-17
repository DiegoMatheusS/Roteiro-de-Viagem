import { distanceMeters } from './roadSpeedLimit';

type Entry = { coords: readonly [number, number]; value: number | null; expires: number };
const MAX_ENTRIES = 100;
const cache: Entry[] = [];

/** Cache curto, apenas com leituras do OSM e sem associação persistente entre vias próximas. */
export function getCachedRoadLimit(coords: readonly [number, number], accuracyMeters: number, now = Date.now()): number | null | undefined {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > 25 || accuracyMeters < 0) return undefined;
  for (let i=cache.length-1; i>=0; i--) {
    if (cache[i].expires <= now) { cache.splice(i,1); continue; }
    if (distanceMeters(coords,cache[i].coords) <= 12) return cache[i].value;
  }
  return undefined;
}

export function rememberRoadLimit(coords: readonly [number, number], value: number | null, now = Date.now()): void {
  if (!coords.every(Number.isFinite)) return;
  cache.push({coords:[...coords] as [number,number],value,expires:now+(value === null?15000:30000)});
  if(cache.length>MAX_ENTRIES)cache.splice(0,cache.length-MAX_ENTRIES);
}

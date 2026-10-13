import OpeningHours from 'opening_hours';
import timezoneLookup from 'tz-lookup';
import type { FuelStation } from '../src/types/fuel';

export function stationOpeningStatus(station: FuelStation, arrivalAt?: Date): 'open' | 'closed' | 'unknown' | 'unverified' {
  if (!station.openingHoursVerifiedAt || Date.now() - Date.parse(station.openingHoursVerifiedAt) > 30 * 86400000) return 'unverified';
  if (station.openingHours === '24/7') return 'open';
  if (!arrivalAt || !station.openingHours || /\b(?:PH|SH|sunrise|sunset|dawn|dusk)\b/.test(station.openingHours)) return 'unknown';
  try {
    const timezone = timezoneLookup(station.lat, station.lng);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(arrivalAt);
    const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
    const local = new Date(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    const hours = new OpeningHours(station.openingHours, null);
    if (hours.getUnknown(local)) return 'unknown';
    return hours.getState(local) ? 'open' : 'closed';
  } catch { return 'unknown'; }
}

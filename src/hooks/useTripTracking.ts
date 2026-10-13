import { useEffect, useState } from 'react';
import { createGpsTrackingState, recordGpsPosition } from '../services/gpsTracking';
import { useDeviceLocation } from './useDeviceLocation';

export function useTripTracking(tripId?: string) {
  const location = useDeviceLocation(!!tripId, tripId);
  const [tracking, setTracking] = useState({ tripId, ...createGpsTrackingState() });

  useEffect(() => {
    setTracking(current => {
      const base = current.tripId === tripId ? current : { tripId, ...createGpsTrackingState() };
      if (location.status !== 'ready') return { ...base, lastPosition: null };
      return location.position ? { tripId, ...recordGpsPosition(base, location.position) } : base;
    });
  }, [tripId, location.position, location.status]);

  return {
    ...location,
    distanceKm: tracking.tripId === tripId ? tracking.distanceKm : 0,
    speedKmH: location.status === 'ready' && location.position?.speedMetersPerSecond != null
      ? Math.round(location.position.speedMetersPerSecond * 3.6) : null
  };
}

import { Geolocation as NativeGeolocation } from '@capacitor/geolocation';
import { isNativeApp } from './nativeApp';
export interface DeviceLocation {
  coords: [number, number];
  accuracyMeters: number;
  speedMetersPerSecond: number | null;
  headingDegrees?: number | null;
  timestamp: number;
}

export function locationErrorMessage(error?: Pick<GeolocationPositionError, 'code'>): string {
  if (error?.code === 1) return 'Localização não permitida. Permita o acesso à localização (GPS) nas permissões do navegador ou aplicativo e tente novamente.';
  if (error?.code === 3) return 'O GPS demorou para responder. Tente novamente em um local aberto.';
  return 'Não foi possível obter sua localização. Confira o GPS e tente novamente.';
}

export function readDeviceLocation(position: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, accuracy, speed, heading } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(position.timestamp)) {
    throw new Error('O GPS retornou uma posição inválida. Tente novamente.');
  }
  return {
    coords: [latitude, longitude],
    accuracyMeters: accuracy,
    speedMetersPerSecond: speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    headingDegrees: heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360 ? heading : null,
    timestamp: position.timestamp
  };
}

export function getCurrentDeviceLocation(geolocation = globalThis.navigator?.geolocation): Promise<DeviceLocation> {
  if (isNativeApp()) return NativeGeolocation.getCurrentPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }).then(position => readDeviceLocation(position as unknown as GeolocationPosition)).catch(error => {
    if (error?.code === 1 || /permission|denied|permiss[aã]o|negad/i.test(String(error?.message || '')))
      throw new Error(locationErrorMessage({ code: 1 }));
    throw new Error('Não foi possível obter GPS recente. Confira o GPS do celular e tente novamente.');
  });
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error('Este dispositivo não disponibilizou o GPS.'));
      return;
    }
    geolocation.getCurrentPosition(position => {
      try { resolve(readDeviceLocation(position)); }
      catch (error) { reject(error); }
    }, error => reject(new Error(locationErrorMessage(error))), {
      enableHighAccuracy: true, maximumAge: 0, timeout: 15000
    });
  });
}

export function watchDeviceLocation(
  geolocation: Geolocation,
  onPosition: (position: DeviceLocation) => void,
  onError: (message: string) => void
): () => void {
  if (isNativeApp()) {
    let stopped = false; let id: string | null = null;
    void NativeGeolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }, (position, error) => { if (stopped) return; if (error || !position) { onError('Confira a permissão de localização precisa e o GPS.'); return; } try { onPosition(readDeviceLocation(position as unknown as GeolocationPosition)); } catch (error) { onError((error as Error).message); } }).then(watchId => { id = watchId; if (stopped) void NativeGeolocation.clearWatch({ id }); }).catch(error => { if (!stopped) onError(error.message); });
    return () => { stopped = true; if (id) void NativeGeolocation.clearWatch({ id }); };
  }
  let stopped = false;
  const watchId = geolocation.watchPosition(position => {
    if (stopped) return;
    try { onPosition(readDeviceLocation(position)); }
    catch (error) { onError((error as Error).message); }
  }, error => {
    if (!stopped) onError(locationErrorMessage(error));
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });

  return () => {
    stopped = true;
    geolocation.clearWatch(watchId);
  };
}


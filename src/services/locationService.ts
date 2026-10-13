export interface DeviceLocation {
  coords: [number, number];
  accuracyMeters: number;
  speedMetersPerSecond: number | null;
  timestamp: number;
}

export function locationErrorMessage(error?: Pick<GeolocationPositionError, 'code'>): string {
  if (error?.code === 1) return 'Permita o acesso à localização para usar o GPS.';
  if (error?.code === 3) return 'O GPS demorou para responder. Tente novamente em um local aberto.';
  return 'Não foi possível obter sua localização. Confira o GPS e tente novamente.';
}

export function readDeviceLocation(position: GeolocationPosition): DeviceLocation {
  const { latitude, longitude, accuracy, speed } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(position.timestamp)) {
    throw new Error('O GPS retornou uma posição inválida. Tente novamente.');
  }
  return {
    coords: [latitude, longitude],
    accuracyMeters: accuracy,
    speedMetersPerSecond: speed !== null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    timestamp: position.timestamp
  };
}

export function getCurrentDeviceLocation(geolocation = globalThis.navigator?.geolocation): Promise<DeviceLocation> {
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

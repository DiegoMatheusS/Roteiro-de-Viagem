import { Capacitor, registerPlugin } from '@capacitor/core';
import type { DeviceLocation } from './locationService';
export const isNativeApp = () => Capacitor.isNativePlatform();
export const TravelNative = registerPlugin<{
  request(options: { path: string; method: string; body?: string; form?: { name: string; value?: string; data?: string; mime?: string }[]; binary?: boolean }): Promise<{ status: number; body: string }>;
  startTracking(options: { tripId: string; distanceKm: number; resume?:boolean }): Promise<void>;
  stopTracking(): Promise<void>;
  state(): Promise<{ tripId: string; lastTripId?:string; stoppedTripId?:string; convoyId?: string; stoppedLocationToken?:string; distanceKm: number; running: boolean; position?: DeviceLocation }>;
  setConvoy(options: { convoyId: string; enabled: boolean; locationToken?: string }): Promise<void>;
  diagnostics():Promise<{preciseLocation:boolean;approximateLocation:boolean;gpsEnabled:boolean;notificationsEnabled:boolean;tracking:boolean;apiConfigured:boolean;androidVersion:string;appVersion:string}>;
  openDeviceSettings(options:{section:'app'|'location'|'notifications'}):Promise<void>;
  openExternal(options:{url:string}):Promise<void>;
  copyText(options:{text:string}):Promise<void>;
  exitApp():Promise<void>;
  signInGoogle(options:{clientId:string}):Promise<{credential:string}>;
}>('TravelNative');
export async function nativeRequest(path: string, options: RequestInit = {}) {
  const form: { name: string; value?: string; data?: string; mime?: string }[] = [];
  if (options.body instanceof FormData) for (const [name, value] of options.body.entries()) {
    if (typeof value === 'string') form.push({ name, value });
    else {
      if (value.size > 8 * 1024 * 1024) throw new Error('Envie uma foto de até 8 MB.');
      const bytes = new Uint8Array(await value.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      form.push({ name, data: btoa(binary), mime: value.type });
    }
  }
  return TravelNative.request({ path, method: options.method || 'GET', body: typeof options.body === 'string' ? options.body : undefined, form: form.length ? form : undefined });
}

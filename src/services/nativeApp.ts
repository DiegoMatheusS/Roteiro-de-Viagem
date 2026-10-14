import { Capacitor, registerPlugin } from '@capacitor/core';
import type { DeviceLocation } from './locationService';
export const isNativeApp = () => Capacitor.isNativePlatform();
export const TravelNative = registerPlugin<{
  request(options: { path: string; method: string; body?: string; form?: { name: string; value?: string; data?: string; mime?: string }[]; binary?: boolean }): Promise<{ status: number; body: string }>;
  startTracking(options: { tripId: string; distanceKm: number }): Promise<void>;
  stopTracking(): Promise<void>;
  state(): Promise<{ tripId: string; convoyId?: string; stoppedLocationToken?:string; distanceKm: number; running: boolean; position?: DeviceLocation }>;
  setConvoy(options: { convoyId: string; enabled: boolean; locationToken?: string }): Promise<void>;
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

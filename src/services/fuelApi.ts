import { isNativeApp, nativeRequest } from './nativeApp';
export class FuelApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }

export async function fuelApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (isNativeApp()) {
    const response = await nativeRequest(path, options);
    let result: any; try { result = JSON.parse(response.body); } catch { result = {}; }
    if (response.status < 200 || response.status >= 300) throw new FuelApiError(result.error || 'Não foi possível acessar o servidor.', response.status, result.code);
    return result as T;
  }
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin',
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new FuelApiError(result.error || 'Não foi possível concluir esta ação. Tente novamente.', response.status, result.code);
  return result;
}


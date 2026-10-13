export class FuelApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function fuelApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin',
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new FuelApiError(result.error || 'Não foi possível concluir esta ação. Tente novamente.', response.status);
  return result;
}

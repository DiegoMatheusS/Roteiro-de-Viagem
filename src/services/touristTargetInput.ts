export type TouristTargetMode = 'km' | 'hours';

export const touristTargetLimits = {
  km: { min: 10, max: 500 },
  hours: { min: 0.5, max: 12 },
} as const;

// Preserve o texto enquanto digita (inclusive "0,", vazio, e valores parciais).
// A rota recebe apenas o numero final validado, nunca um valor ajustado automaticamente.
export function parseTouristTarget(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d*)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function getTouristTargetError(mode: TouristTargetMode, value: string): string | null {
  const numeric = parseTouristTarget(value);
  if (numeric === null) return 'Informe um valor válido para planejar o passeio.';
  const { min, max } = touristTargetLimits[mode];
  if (numeric < min) return mode === 'km'
    ? 'KM muito baixo — informe pelo menos 10 km.'
    : 'Quantidade em Horas muito baixo — informe pelo menos 0,5 hora.';
  if (numeric > max) return mode === 'km'
    ? 'O máximo disponível por passeio é 500 km.'
    : 'O máximo disponível por passeio é 12 horas.';
  return null;
}

export function canTypeTouristTarget(value: string): boolean {
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

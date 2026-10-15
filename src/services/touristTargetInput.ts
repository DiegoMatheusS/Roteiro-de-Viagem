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
  if (numeric <= 0) return 'Informe uma distância ou duração maior que zero.';
  if (numeric > max) return mode === 'km'
    ? 'O máximo disponível por passeio é 500 km.'
    : 'O máximo disponível por passeio é 12 horas.';
  return null;
}

// Aviso visual: valores baixos são permitidos, não bloqueiam o botão.
export function getTouristTargetWarning(mode: TouristTargetMode, value: string): string | null {
  const numeric = parseTouristTarget(value);
  if (numeric === null || numeric <= 0 || numeric >= touristTargetLimits[mode].min) return null;
  return mode === 'km' ? 'KM muito baixo — o trajeto pode ser limitado.' : 'Quantidade em Horas muito baixa — o trajeto pode ser limitado.';
}

export function canTypeTouristTarget(value: string): boolean {
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

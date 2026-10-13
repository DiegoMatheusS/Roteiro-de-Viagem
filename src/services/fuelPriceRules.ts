import { FUEL_OPTIONS, type FuelKind, type PriceDraft } from '../types/fuel';

export const PRICE_FRESH_HOURS = 72;

export function validatePriceDraft(value: unknown): PriceDraft {
  const item = value as Partial<PriceDraft> | null;
  if (!item || !FUEL_OPTIONS.some(f => f.id === item.fuelType)) throw new Error('Selecione um combustível válido.');
  if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0.1 || item.price > 50) {
    throw new Error('Informe um preço entre R$ 0,10 e R$ 50,00 por unidade.');
  }
  if (Math.abs(item.price * 1000 - Math.round(item.price * 1000)) > 0.000001) throw new Error('Use no máximo três casas decimais.');
  const customLabel = item.fuelType === 'outro' ? String(item.customLabel || '').trim() : undefined;
  if (item.fuelType === 'outro' && (!customLabel || customLabel.length > 50)) throw new Error('Informe o nome do outro combustível (até 50 caracteres).');
  return { fuelType: item.fuelType as FuelKind, price: item.price, ...(customLabel ? { customLabel } : {}) };
}

export function priceReliability(observedAt: string, confirmations: number, contests: number, contributorHistory: number, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(observedAt)) / 3600000);
  const stale = !Number.isFinite(ageHours) || ageHours > PRICE_FRESH_HOURS;
  const score = Math.max(0, Math.min(100, Math.round(45 * Math.max(0, 1 - ageHours / 168) + Math.min(35, confirmations * 10) + Math.min(20, contributorHistory * 2) - contests * 25)));
  return { stale, disputed: contests > 0 && contests >= confirmations, reliabilityScore: score,
    reliability: (score >= 75 ? 'Alta' : score >= 45 ? 'Média' : 'Baixa') as 'Alta' | 'Média' | 'Baixa' };
}

export function parseFuelPriceText(text: string): PriceDraft[] {
  const lines = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/\r?\n/);
  const drafts = new Map<FuelKind, PriceDraft>();
  const ambiguous = new Set<FuelKind>();
  lines.forEach((line, i) => {
    let fuelType: FuelKind | undefined;
    if (/GASOLINA|GASOLINE/.test(line)) fuelType = /ADITIV/.test(line) ? 'gasolina_aditivada' : 'gasolina_comum';
    else if (/ETANOL|ALCOOL/.test(line)) fuelType = 'etanol';
    else if (/DIESEL/.test(line)) fuelType = /S\s*10/.test(line) ? 'diesel_s10' : 'diesel_comum';
    else if (/\bGNV\b/.test(line)) fuelType = 'gnv';
    if (!fuelType) return;
    if (ambiguous.has(fuelType)) return;
    const priceText = line.match(/\b\d{1,2}[,.]\d{2,3}\b/)?.[0] || lines[i + 1]?.match(/^\s*(?:R\$\s*)?(\d{1,2}[,.]\d{2,3})\s*$/)?.[1];
    if (!priceText) return;
    try {
      const draft = validatePriceDraft({ fuelType, price: Number(priceText.replace(',', '.')) });
      // Ambiguous duplicate labels are left for manual entry, never guessed.
      if (drafts.has(fuelType)) { drafts.delete(fuelType); ambiguous.add(fuelType); }
      else drafts.set(fuelType, draft);
    } catch { /* Unreadable or incompatible values require manual correction. */ }
  });
  return [...drafts.values()];
}

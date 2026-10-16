import type { Place } from '../types/admin';
import type { FuelKind, FuelStation } from '../types/fuel';
import { FUEL_OPTIONS } from '../types/fuel';
import type { RouteToll } from '../types/tolls';

export const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function fuelMarkerPrice(station: FuelStation, kind: FuelKind) {
  const price = station.prices.find(value => value.fuelType === kind && !value.stale && !value.disputed);
  if (!price) return 'Preço não informado';
  const fuel = FUEL_OPTIONS.find(option => option.id === kind)!;
  return `${fuel.label} · ${brl(price.price)}/${fuel.unit}`;
}
export function catalogTollForVehicle(place: Place, vehicleType: 'car' | 'motorcycle', at = Date.now()): RouteToll {
  const tariffs = (place.tollTariffs || []).filter(tariff => tariff.vehicleType === vehicleType && Date.parse(tariff.validUntil) > at);
  // A directional price cannot be claimed as the price of an unspecified passage.
  const general = tariffs.find(tariff => tariff.headingDegrees === null);
  return { id: place.id, name: place.name, coords: [place.lat, place.lng], sourceUrl: place.sourceUrl, passages: 1,
    price: general?.price ?? null, priceId: general?.id, observedAt: general?.observedAt, validUntil: general?.validUntil,
    tariffs: tariffs.filter(tariff => tariff.headingDegrees !== null).map(tariff => ({ ...tariff, headingDegrees: tariff.headingDegrees!, priceId: tariff.id })) };
}
export function tollMarkerPrice(toll: RouteToll) {
  if (toll.price !== null) return toll.price === 0 ? 'Isento · veículo selecionado' : `${brl(toll.price)} · por passagem`;
  const values = toll.tariffs?.flatMap(tariff => tariff.price === null ? [] : [tariff.price]) || [];
  return values.length ? `A partir de ${brl(Math.min(...values))} · por sentido` : 'Tarifa não informada';
}

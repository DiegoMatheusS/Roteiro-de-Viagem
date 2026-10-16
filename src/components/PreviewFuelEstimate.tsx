import { useState } from 'react';
import type { TripPlan, Vehicle } from '../types';
import { useFuelStations } from '../hooks/useFuelStations';
import { fuelEstimatePatch, vehicleFuelKind } from '../services/tripBudget';
import { brl } from '../services/mapPrices';
import { FUEL_OPTIONS } from '../types/fuel';

export function PreviewFuelEstimate({ trip, vehicle, onChange }: { trip: TripPlan; vehicle: Vehicle; onChange: (patch: Partial<TripPlan>) => void }) {
  const stations = useFuelStations(trip.routePath, vehicle.fuelType !== 'eletrico');
  const [draft, setDraft] = useState(trip.fuelPricePerLiter > 0 ? String(trip.fuelPricePerLiter) : '');
  const kind = vehicleFuelKind(vehicle);
  if (vehicle.fuelType === 'eletrico') return <p className="text-xs text-slate-500">Estimativa de recarga ainda indisponível para este veículo.</p>;
  const prices = stations.stations.flatMap(station => station.prices
    .filter(price => price.fuelType === kind && !price.stale && !price.disputed)
    .map(price => ({ station, price }))).slice(0, 12);
  const value = Number(draft.replace(',', '.'));
  const invalid = draft !== '' && (!Number.isFinite(value) || value <= 0 || value > 50);
  return <div className="space-y-2">
    <label className="flex items-center justify-between gap-3 text-xs text-slate-600">{FUEL_OPTIONS.find(fuel => fuel.id === kind)?.label} (R$/L)
      <input aria-label="Preço do combustível por litro" inputMode="decimal" placeholder="Ex.: 6,20" value={draft} onChange={event => {
        const text = event.target.value; setDraft(text);
        onChange(fuelEstimatePatch(trip, vehicle, Number(text.replace(',', '.'))));
      }} className="w-24 rounded-lg border border-slate-200 p-2 text-right text-sm text-slate-900" />
    </label>
    {invalid && <p role="alert" className="text-xs text-rose-700">Informe um preço entre R$ 0,01 e R$ 50,00.</p>}
    {prices.length > 0 && <select aria-label="Usar preço de um posto do percurso" value="" onChange={event => {
      const item = prices.find(item => item.price.id === event.target.value); if (!item) return;
      const source = { stationId: item.station.id, stationName: item.station.name, contributionId: item.price.id, observedAt: item.price.observedAt, fuelType: kind, price: item.price.price, consumptionKmPerLiter: vehicle.consumption.userConfigured || vehicle.consumption.referenceAverage };
      setDraft(String(item.price.price)); onChange(fuelEstimatePatch(trip, vehicle, item.price.price, source));
    }} className="w-full border rounded-lg p-2 text-xs bg-white">
      <option value="">Usar preço de um posto do percurso</option>
      {prices.map(({ station, price }) => <option key={price.id} value={price.id}>{station.name} · {brl(price.price)}/L</option>)}
    </select>}
    {trip.fuelPriceSource && <p className="text-[10px] text-blue-700">{trip.fuelPriceSource.stationName} · informado em {new Date(trip.fuelPriceSource.observedAt).toLocaleDateString('pt-BR')}</p>}
  </div>;
}

import type { TripPlan } from '../types';
import { brl } from '../services/mapPrices';

export function TripCostSummary({ trip }: { trip: TripPlan }) {
  return <div aria-label="Estimativa de custos do trajeto" className="grid grid-cols-2 gap-2 text-xs">
    <div className="bg-slate-50 rounded-xl p-2.5"><span className="text-slate-500 block text-[10px]">Combustível</span><strong>{trip.fuelPricePerLiter > 0 ? brl(trip.estimatedFuelCost) : 'Informe o preço'}</strong>{trip.estimatedFuelLiters > 0 && <small className="block text-slate-500">{trip.estimatedFuelLiters.toFixed(1)} L estimados</small>}</div>
    <div className="bg-slate-50 rounded-xl p-2.5"><span className="text-slate-500 block text-[10px]">Pedágios conhecidos</span><strong>{trip.tollsStatus === 'partial' ? brl(trip.knownTollsCost) : 'A confirmar'}</strong><small className="block text-slate-500">Cobertura parcial</small></div>
    <p className="col-span-2 text-[10px] text-slate-500">Subtotal conhecido: <strong className="text-slate-700">{brl(trip.totalEstimatedCost)}</strong> · Valores ausentes não estão incluídos.</p>
  </div>;
}

import React, { useState } from 'react';
import { Fuel, Search } from 'lucide-react';
import type { Vehicle } from '../types';
import { FUEL_OPTIONS, type AppliedFuelPrice, type FuelKind, type FuelComparisonResult } from '../types/fuel';
import { fuelApi } from '../services/fuelApi';
import { FuelStationModal } from './FuelStationModal';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function FuelComparisonPanel({ vehicle, routePath, onApply }: { vehicle: Vehicle; routePath: [number, number][]; onApply: (price: AppliedFuelPrice) => void }) {
  const [open, setOpen] = useState(false);
  const [fuelType, setFuelType] = useState<FuelKind>(vehicle.fuelType === 'etanol' ? 'etanol' : vehicle.fuelType === 'diesel' ? 'diesel_s10' : 'gasolina_comum');
  const [remaining, setRemaining] = useState('');
  const [liters, setLiters] = useState('');
  const [consumption, setConsumption] = useState(String(vehicle.consumption.userConfigured));
  const [result, setResult] = useState<FuelComparisonResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [departureAt, setDepartureAt] = useState('');
  const compatible = FUEL_OPTIONS.filter(fuel => vehicle.fuelType === 'diesel' ? ['diesel_comum', 'diesel_s10'].includes(fuel.id) : vehicle.fuelType === 'etanol' ? fuel.id === 'etanol' : vehicle.fuelType === 'flex' ? ['gasolina_comum', 'gasolina_aditivada', 'etanol'].includes(fuel.id) : ['gasolina_comum', 'gasolina_aditivada'].includes(fuel.id));
  const compare = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setResult(null); setApplied(null);
    try {
      const value = await fuelApi<FuelComparisonResult>('/fuel/compare', { method: 'POST', body: JSON.stringify({ routePath, fuelType, consumptionKmPerLiter: Number(consumption), remainingFuelLiters: Number(remaining), litersToBuy: Number(liters), tankCapacityLiters: vehicle.tankCapacityLiters, departureAt: departureAt ? new Date(departureAt).toISOString() : undefined }) });
      setResult(value);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  return <section className="border border-emerald-200 rounded-2xl bg-emerald-50/50 p-4 space-y-3">
    <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-sm font-bold text-emerald-900"><span className="flex items-center gap-2"><Fuel className="w-4 h-4" />Encontrar combustível mais barato</span><span>{open ? '−' : '+'}</span></button>
    {open && <>
      <p className="text-xs text-slate-600">Comparamos o preço informado e o combustível gasto no desvio. A autonomia considera a partida deste roteiro.</p>
      {vehicle.fuelType === 'eletrico' ? <p className="text-xs text-amber-800">A comparação de autonomia para veículos elétricos precisa de consumo em kWh. Os preços dos postos continuam disponíveis no mapa.</p> : <form onSubmit={compare} className="space-y-3">
        <label className="block text-xs font-semibold">Combustível<select value={fuelType} onChange={e => { setFuelType(e.target.value as FuelKind); setResult(null); }} className="w-full border rounded-xl p-2 mt-1">{compatible.map(fuel => <option key={fuel.id} value={fuel.id}>{fuel.label}</option>)}</select></label>
        <div className="grid sm:grid-cols-3 grid-cols-1 gap-3 text-xs">
          <label className="font-semibold">Restante no tanque (L)<input required type="number" min="0" max={vehicle.tankCapacityLiters} step="0.1" value={remaining} onChange={e => { setRemaining(e.target.value); setResult(null); }} className="w-full border rounded-xl p-2 mt-1" placeholder="Informe o restante" /></label>
          <label className="font-semibold">Quanto abastecer (L)<input required type="number" min="0.1" max={vehicle.tankCapacityLiters - Number(remaining)} step="0.1" value={liters} onChange={e => { setLiters(e.target.value); setResult(null); }} className="w-full border rounded-xl p-2 mt-1" placeholder="Quantidade desejada" /></label>
          <label className="font-semibold">Consumo neste combustível (km/L)<input required type="number" min="1" max="100" step="0.1" value={consumption} onChange={e => { setConsumption(e.target.value); setResult(null); }} className="w-full border rounded-xl p-2 mt-1" /></label>
        </div>
        <label className="block text-xs font-semibold">Saída para comparar horários (opcional)<input type="datetime-local" value={departureAt} onChange={e => { setDepartureAt(e.target.value); setResult(null); }} className="w-full border rounded-xl p-2 mt-1" /><span className="block mt-1 font-normal text-slate-500">Se deixar vazio, consideramos a saída agora.</span></label>
        <p className="text-[11px] text-slate-500">Ajuste o consumo se trocar entre gasolina e etanol. Confirmar o horário com o posto continua necessário quando não houver verificação.</p>
        <button disabled={busy} className="bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold flex items-center gap-2 disabled:opacity-50"><Search className="w-4 h-4" />{busy ? 'Calculando preços e desvios...' : 'Comparar postos na rota'}</button>
      </form>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {result && <div className="space-y-3">
        <p className="text-xs text-slate-600">Autonomia estimada: <strong>{result.estimatedRangeKm.toFixed(0)} km</strong>. Só entram preços de até 72 horas, sem contestação predominante.</p>
        {result.results.length === 0 && <p className="text-sm text-slate-600">Nenhum posto pôde ser comparado com um preço atualizado. Você pode contribuir pelo mapa.</p>}
        {result.results.map((item, index) => <article key={item.station.id} className={`rounded-xl border p-3 space-y-2 ${item.reachable ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
          <div className="flex justify-between gap-3"><div><strong className="text-sm">{item.station.name}</strong>{index === 0 && item.reachable && item.openingStatus !== 'closed' && <span className="block text-[10px] font-bold text-emerald-700">Menor custo entre os postos comparados</span>}</div><strong className="text-emerald-800">{money(item.totalCost)}</strong></div>
          <p className="text-xs text-slate-600">{money(item.contribution.price)}/L · até o posto: {item.distanceToStationKm.toFixed(1)} km · desvio: {item.detourKm.toFixed(1)} km</p>
          <p className="text-xs text-slate-600">Abastecimento: {money(item.purchaseCost)} + combustível do desvio: {money(item.extraFuelCost)}</p>
          <p className="text-[11px] text-slate-500">Preço visto em {new Date(item.contribution.observedAt).toLocaleString('pt-BR')} · confiabilidade {item.contribution.reliability.toLowerCase()} · {item.station.openingHoursVerifiedAt ? `horário confirmado: ${item.station.openingHours}` : 'horário não confirmado'}</p>
          {!item.reachable && <p className="text-xs font-bold text-rose-700">Fora da autonomia informada. Não recomendado como próxima parada.</p>}
          {item.openingStatus === 'closed' && <p className="text-xs font-bold text-rose-700">Fechado no horário estimado de chegada, conforme horário verificado.</p>}
          {item.openingStatus === 'open' && <p className="text-xs text-emerald-700">Aberto no horário estimado de chegada, conforme horário verificado.</p>}
          {item.estimatedArrivalAt && <p className="text-[11px] text-slate-500">Chegada estimada: {new Date(item.estimatedArrivalAt).toLocaleString('pt-BR')}</p>}
          <div className="flex flex-wrap gap-3"><button disabled={!item.reachable || item.openingStatus === 'closed'} type="button" onClick={() => { onApply({ stationId: item.station.id, stationName: item.station.name, contributionId: item.contribution.id, observedAt: item.contribution.observedAt, fuelType, price: item.contribution.price, consumptionKmPerLiter: Number(consumption) }); setApplied(item.station.id); }} className="text-xs font-bold text-emerald-700 disabled:text-slate-400">{applied === item.station.id ? '✓ Preço aplicado ao orçamento' : 'Usar preço no cálculo da viagem'}</button><button type="button" className="text-xs text-slate-600 underline" onClick={() => setSelectedStation(item.station.id)}>Ver preços e contribuir</button></div>
        </article>)}
        <p className="text-[11px] text-slate-500">{result.stationsWithNoFreshPrice} postos sem preço recente. {result.routingUnavailable > 0 ? `${result.routingUnavailable} desvios não puderam ser calculados.` : ''} {(result.additionalCandidates || 0) > 0 ? `Comparação limitada a 8 postos; ${result.additionalCandidates} candidatos adicionais não consultados.` : ''} Estimativa sujeita a consumo real e mudança de preços. Fonte dos trajetos: {result.source}.</p>
      </div>}
    </>}
    {selectedStation && <FuelStationModal stationId={selectedStation} onClose={() => setSelectedStation(null)} />}
  </section>;
}

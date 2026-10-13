import React, { useState } from 'react';
import { FUEL_OPTIONS, type FuelKind, type PriceDraft } from '../types/fuel';
import { validatePriceDraft } from '../services/fuelPriceRules';

export const dateInput = (value = new Date().toISOString()) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function PriceEditor({ initial = [], observedAt, button = 'Aprovar e publicar', busy, onSubmit }: {
  initial?: PriceDraft[]; observedAt?: string; button?: string; busy: boolean;
  onSubmit: (prices: PriceDraft[], observedAt: string) => Promise<void>;
}) {
  const [rows, setRows] = useState(() => initial.length ? initial.map(p => ({ fuelType: p.fuelType, price: String(p.price), customLabel: p.customLabel || '' })) :
    FUEL_OPTIONS.slice(0, 5).map(f => ({ fuelType: f.id as FuelKind, price: '', customLabel: '' })));
  const [date, setDate] = useState(() => dateInput(observedAt));
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const prices = rows.filter(row => row.price.trim()).map(row => validatePriceDraft({ fuelType: row.fuelType, price: Number(row.price.replace(',', '.')), customLabel: row.customLabel }));
      if (!prices.length) throw new Error('Preencha pelo menos um preço. Campos vazios não serão publicados.');
      if (new Set(prices.map(p => `${p.fuelType}:${p.customLabel || ''}`)).size !== prices.length) throw new Error('Informe cada combustível apenas uma vez.');
      await onSubmit(prices, new Date(date).toISOString());
    } catch (error) { setError((error as Error).message); }
  };
  return <form onSubmit={submit} className="space-y-3">
    <p className="text-xs text-slate-500">Preencha somente os valores que você conferiu. Campos vazios mantêm o preço anterior, quando houver.</p>
    <div className="grid sm:grid-cols-2 gap-3">{rows.map((row, index) => <div key={index} className="bg-slate-50 rounded-xl p-3 space-y-2">
      <select aria-label={`Combustível ${index + 1}`} className="border rounded-lg p-2 w-full text-sm" value={row.fuelType} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, fuelType: e.target.value as FuelKind } : r))}>
        {FUEL_OPTIONS.map(f => <option value={f.id} key={f.id}>{f.label}</option>)}
      </select>
      {row.fuelType === 'outro' && <input aria-label={`Nome do combustível ${index + 1}`} maxLength={50} placeholder="Nome do combustível" value={row.customLabel} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, customLabel: e.target.value } : r))} className="border rounded-lg p-2 w-full" />}
      <label className="block text-xs font-semibold">Preço por {FUEL_OPTIONS.find(f => f.id === row.fuelType)!.unit}<input aria-label={`Preço ${index + 1}`} inputMode="decimal" value={row.price} placeholder="Não informado" onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, price: e.target.value } : r))} className="mt-1 border rounded-lg p-2 w-full" /></label>
    </div>)}</div>
    {rows.length < 12 && <button type="button" onClick={() => setRows(current => [...current, { fuelType: 'outro', price: '', customLabel: '' }])} className="text-xs text-emerald-700 font-bold">+ Outro combustível</button>}
    <label className="block text-xs font-semibold">Data da informação<input aria-label="Data da informação" required type="datetime-local" value={date} max={dateInput()} onChange={e => setDate(e.target.value)} className="block mt-1 border rounded-xl p-3 w-full" /></label>
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" required className="mt-0.5" />Conferi os valores, o posto e a data. A foto, quando usada, está legível e não expõe dados pessoais.</label>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <button disabled={busy} className="bg-emerald-600 text-white rounded-xl p-3 font-bold text-sm disabled:opacity-50">{busy ? 'Salvando...' : button}</button>
  </form>;
}

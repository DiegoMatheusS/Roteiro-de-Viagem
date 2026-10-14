import React, { useState } from 'react';
import type { RouteToll } from '../types/tolls';
import { useAuth } from '../contexts/AuthContext';
import { fuelApi } from '../services/fuelApi';
export function TollContribution({ toll, vehicleType }: { toll: RouteToll; vehicleType: 'car' | 'motorcycle' }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false), [price, setPrice] = useState(''), [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState<File | null>(null), [heading, setHeading] = useState(''), [both, setBoth] = useState(true), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!auth.user) { auth.promptLogin(); return; }
    setBusy(true); setMessage('');
    try {
      const form = new FormData(); form.append('price', price.replace(',', '.')); form.append('vehicleType', vehicleType);
      form.append('observedAt', new Date(date + 'T00:00:00').toISOString()); form.append('confirmed', String(confirmed)); form.append('headingDegrees', both ? '' : heading);
      if (photo) form.append('photo', photo);
      const result = await fuelApi<{ message: string }>(`/tolls/${encodeURIComponent(toll.id)}/contributions`, { method: 'POST', body: form });
      setMessage(result.message); setPhoto(null); setPrice(''); setConfirmed(false);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  return <div className="border rounded-xl p-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><a href={toll.sourceUrl} target="_blank" rel="noreferrer" className="font-bold underline">{toll.name}</a><strong>{toll.price == null ? 'Sem tarifa aprovada' : `R$ ${(toll.price * toll.passages).toFixed(2)}`}</strong></div><p className="text-slate-500">{toll.passages} passagem(ns) · {vehicleType === 'motorcycle' ? 'Moto' : 'Carro'}{toll.observedAt ? ` · Evidência: ${new Date(toll.observedAt).toLocaleDateString('pt-BR')}` : ''}</p>
    <button onClick={() => setOpen(!open)} className="text-emerald-700 font-bold">{open ? 'Fechar contribuição' : 'Informar tarifa ou enviar foto'}</button>
    {open && <form onSubmit={submit} className="space-y-3"><label className="block">Valor por passagem (opcional com foto)<input aria-label="Tarifa do pedágio" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" className="block w-full border rounded-lg p-2 mt-1" /></label><label className="block">Data da tarifa<input type="date" required max={new Date().toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} className="block w-full border rounded-lg p-2" /></label><label className="block">Foto da placa de tarifas<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)} className="block max-w-full" /></label><label className="flex gap-2"><input type="checkbox" checked={both} onChange={e => setBoth(e.target.checked)} />Mesma tarifa nos dois sentidos</label>{!both && <label className="block">Sentido de passagem (0° norte, 90° leste, 180° sul, 270° oeste)<input type="number" min="0" max="359" required value={heading} onChange={e => setHeading(e.target.value)} className="block w-full border p-2 rounded-lg" /></label>}<label className="flex gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que a informação é deste pedágio e da categoria indicada.</label><p className="text-slate-500">O administrador confere antes de publicar. Fotografe somente com o veículo parado.</p><button disabled={busy} className="px-4 py-2 bg-emerald-700 text-white rounded-xl">{busy ? 'Enviando...' : 'Enviar para análise'}</button></form>}{message && <p role="status">{message}</p>}
  </div>;
}

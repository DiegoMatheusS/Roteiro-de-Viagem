import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { buttonClass, inputClass } from './shared';
import { LocationSearch } from '../LocationSearch';
import type { LocationSelection } from '../../types/itinerary';

type TollPlace = { id: string; name: string; lat: number; lng: number; sourceUrl: string; activeTariffs: number };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
export function TollManager({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<TollPlace[]>([]), [q, setQ] = useState('');
  const [name, setName] = useState(''), [lat, setLat] = useState(''), [lng, setLng] = useState('');
  const [location, setLocation] = useState<LocationSelection>({ name: '' });
  const [selected, setSelected] = useState<TollPlace | null>(null), [vehicleType, setVehicleType] = useState('car');
  const [price, setPrice] = useState(''), [observedAt, setObservedAt] = useState(today()), [headingDegrees, setHeadingDegrees] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = () => fuelApi<{ items: TollPlace[] }>(`/admin/toll-places?q=${encodeURIComponent(q)}`).then(result => setItems(result.items));
  useEffect(() => { load().catch(e => setError((e as Error).message)); }, []);
  const lookup = (value: LocationSelection) => { setLocation(value); if (value.coords) { setLat(String(value.coords[0])); setLng(String(value.coords[1])); } };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await fuelApi<TollPlace>('/admin/toll-places', { method: 'POST',
        body: JSON.stringify({ name: name.trim(), lat: lat.replace(',','.'), lng: lng.replace(',','.') }) });
      setName(''); setLat(''); setLng(''); setLocation({name:''}); setSelected(result);
      setMessage('Praça de pedágio cadastrada. Informe uma tarifa verificada para exibir o valor nas rotas.');
      await load(); onChange();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const publish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await fuelApi(`/admin/toll-places/${encodeURIComponent(selected.id)}/tariffs`, {
        method: 'POST', body: JSON.stringify({ vehicleType, price: price.replace(',', '.'), headingDegrees, observedAt: new Date(`${observedAt}T12:00:00`).toISOString() })
      });
      setPrice(''); setMessage('Tarifa publicada. O valor será usado nas rotas que identificarem esta praça.'); await load(); onChange();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="space-y-5">
    <div><h2 className="font-bold text-xl">Cadastrar pedágios</h2><p className="text-sm text-slate-600">Cadastre praças com a localização exata e publique preços verificados por categoria de veículo. Tarifa aprovada tem validade de 90 dias.</p></div>
    {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 p-3 rounded-xl">{message}</p>}
    <form onSubmit={create} className="space-y-4 border rounded-2xl bg-white p-5">
      <h3 className="font-bold">Nova praça de pedágio</h3>
      <label className="block text-xs font-semibold">Nome da praça *<input required value={name} maxLength={180} onChange={event => setName(event.target.value)} className={`${inputClass} mt-1`} placeholder="Ex.: Praça km 45 — Rodovia SP-000"/></label>
      <LocationSearch label="Pesquisar rodovia ou local no mapa" value={location} onChange={lookup}/>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="block text-xs font-semibold">Latitude *<input required value={lat} onChange={event => setLat(event.target.value)} className={`${inputClass} mt-1`} placeholder="-23.55"/></label>
        <label className="block text-xs font-semibold">Longitude *<input required value={lng} onChange={event => setLng(event.target.value)} className={`${inputClass} mt-1`} placeholder="-46.63"/></label>
      </div>
      <p className="text-xs text-amber-800">A localização deve corresponder à cobrança na própria via, não a um endereço próximo. Confira o ponto antes de publicar.</p>
      <button disabled={busy} className={`${buttonClass} bg-emerald-700 border-emerald-700 text-white`}>Cadastrar praça</button>
    </form>
    <div className="border rounded-2xl bg-white p-5 space-y-3">
      <h3 className="font-bold">Praças cadastradas</h3>
      <form onSubmit={e => {e.preventDefault();load().catch(error => setError(error.message));}} className="flex gap-2">
        <input aria-label="Pesquisar praça" value={q} onChange={e => setQ(e.target.value)} className={inputClass} placeholder="Pesquisar nome da praça"/>
        <button className={buttonClass}>Buscar</button>
      </form>
      <div className="grid md:grid-cols-2 gap-2">{items.map(place => <button type="button" key={place.id} onClick={() => { setSelected(place); setError(''); }} className={`text-left p-3 border rounded-xl text-sm ${selected?.id === place.id ? 'border-emerald-500 bg-emerald-50':'hover:bg-slate-50'}`}>
        <strong className="block">{place.name}</strong><span className="text-xs text-slate-500">{place.activeTariffs} tarifa(s) vigente(s)</span>
      </button>)}</div>
      {!items.length && <p className="text-xs text-slate-500">Nenhuma praça encontrada.</p>}
    </div>
    {selected && <form onSubmit={publish} className="border rounded-2xl bg-white p-5 space-y-4">
      <h3 className="font-bold">Publicar tarifa — {selected.name}</h3>
      <a className="text-sm underline text-emerald-700" href={selected.sourceUrl} target="_blank" rel="noreferrer">Verificar local no mapa</a>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs font-semibold">Veículo<select aria-label="Categoria da tarifa" value={vehicleType} onChange={e=>setVehicleType(e.target.value)} className={`${inputClass} mt-1`}><option value="car">Carro</option><option value="motorcycle">Moto</option></select></label>
        <label className="text-xs font-semibold">Preço por passagem (R$) *<input aria-label="Preço do pedágio" required inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="Ex.: 8,50" className={`${inputClass} mt-1`}/></label>
        <label className="text-xs font-semibold">Data da verificação *<input type="date" required max={today()} value={observedAt} onChange={e=>setObservedAt(e.target.value)} className={`${inputClass} mt-1`}/></label>
        <label className="text-xs font-semibold">Sentido em graus (opcional)<input type="number" min="0" max="359" step="1" value={headingDegrees} onChange={e=>setHeadingDegrees(e.target.value)} placeholder="Vazio: ambos" className={`${inputClass} mt-1`}/></label>
      </div>
      <button disabled={busy} className={`${buttonClass} bg-emerald-700 border-emerald-700 text-white`}>Publicar tarifa verificada</button>
    </form>}
  </section>;
}

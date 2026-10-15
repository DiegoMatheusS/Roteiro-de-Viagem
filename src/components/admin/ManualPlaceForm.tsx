import React, { useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { LocationSearch } from '../LocationSearch';
import type { LocationSelection } from '../../types/itinerary';
import { PLACE_KINDS, type Place, type PlaceKind } from '../../types/admin';
import { inputClass, buttonClass } from './shared';

export function ManualPlaceForm({ onSaved }: { onSaved: (place: Place) => void }) {
  const [kind, setKind] = useState<PlaceKind>('fuel');
  const [name, setName] = useState(''), [address, setAddress] = useState('');
  const [description, setDescription] = useState(''), [phone, setPhone] = useState('');
  const [website, setWebsite] = useState(''), [openingHours, setOpeningHours] = useState('');
  const [lat, setLat] = useState(''), [lng, setLng] = useState('');
  const [location, setLocation] = useState<LocationSelection>({ name: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choose = (result: LocationSelection) => {
    setLocation(result);
    if (result.coords) {
      setLat(String(result.coords[0])); setLng(String(result.coords[1]));
      if (!name) setName(result.name);
      if (!address) setAddress(result.address || '');
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    const latitude = Number(lat.replace(',', '.')), longitude = Number(lng.replace(',', '.'));
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude)>90 || Math.abs(longitude)>180 || latitude===0 && longitude===0) {
      setError('Escolha um resultado da busca ou informe latitude e longitude válidas.'); return;
    }
    setBusy(true);
    try {
      const place = await fuelApi<Place>('/admin/places/manual', {
        method: 'POST', body: JSON.stringify({ name: name.trim(), kind, address, description, phone, website, openingHours, lat: latitude, lng: longitude })
      });
      setName(''); setAddress(''); setDescription(''); setPhone(''); setWebsite(''); setOpeningHours('');
      setLat(''); setLng(''); setLocation({ name: '' }); onSaved(place);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-4">
    <div><h3 className="font-bold text-lg">Cadastrar novo local</h3>
      <p className="text-xs text-slate-600 mt-1">Cadastre um local real com endereço e coordenadas, sem depender de um link do OpenStreetMap.</p></div>
    <div className="grid md:grid-cols-2 gap-3">
      <label className="block text-xs font-semibold">Categoria *
        <select aria-label="Categoria do novo local" required value={kind} onChange={e => setKind(e.target.value as PlaceKind)} className={`${inputClass} mt-1`}>{PLACE_KINDS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      </label>
      <label className="block text-xs font-semibold">Nome do local *
        <input aria-label="Nome do novo local" required maxLength={150} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Posto Central ou Cachoeira da Serra" className={`${inputClass} mt-1`}/>
      </label>
    </div>
    <LocationSearch label="Pesquisar localização no mapa" value={location} onChange={choose} placeholder="Ex.: Avenida Brasil 120, Campinas" />
    <div className="grid md:grid-cols-2 gap-3">
      <label className="block text-xs font-semibold">Latitude *<input aria-label="Latitude do novo local" required inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)} placeholder="-23.5505" className={`${inputClass} mt-1`}/></label>
      <label className="block text-xs font-semibold">Longitude *<input aria-label="Longitude do novo local" required inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)} placeholder="-46.6333" className={`${inputClass} mt-1`}/></label>
    </div>
    {lat && lng && Number.isFinite(Number(lat.replace(',', '.'))) && Number.isFinite(Number(lng.replace(',', '.'))) && <a className="text-sm text-emerald-700 underline" href={`https://www.openstreetmap.org/?mlat=${lat.replace(',', '.')}&mlon=${lng.replace(',', '.')}#map=17/${lat.replace(',', '.')}/${lng.replace(',', '.')}`} target="_blank" rel="noreferrer">Conferir ponto no mapa</a>}
    <div className="grid md:grid-cols-2 gap-3">
      <label className="block text-xs font-semibold">Endereço<input value={address} maxLength={250} onChange={e => setAddress(e.target.value)} className={`${inputClass} mt-1`}/></label>
      <label className="block text-xs font-semibold">Telefone<input value={phone} maxLength={50} onChange={e => setPhone(e.target.value)} className={`${inputClass} mt-1`}/></label>
      <label className="block text-xs font-semibold">Site<input type="url" value={website} maxLength={300} placeholder="https://" onChange={e => setWebsite(e.target.value)} className={`${inputClass} mt-1`}/></label>
      <label className="block text-xs font-semibold">Horário de funcionamento<input value={openingHours} maxLength={200} onChange={e => setOpeningHours(e.target.value)} placeholder="Ex.: Seg-Sex 08:00-18:00" className={`${inputClass} mt-1`}/></label>
    </div>
    <label className="block text-xs font-semibold">Descrição<textarea value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} className={`${inputClass} mt-1`} rows={3}/></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy} className={`${buttonClass} bg-emerald-700 border-emerald-700 text-white`}>{busy ? 'Salvando...' : 'Cadastrar e publicar no aplicativo'}</button>
  </form>;
}

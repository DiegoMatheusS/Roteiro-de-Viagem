import React, { useState } from 'react';
import { PLACE_KINDS, TOURIST_PLACE_KINDS } from '../../types/admin';
import { buttonClass, inputClass } from './shared';

const blank = (touristOnly = false) => ({ name: '', kind: touristOnly ? 'waterfall' : 'fuel', address: '', lat: '', lng: '', phone: '', website: '', description: '', openingHours: '' });

export function ManualPlaceForm({ busy, onSave, touristOnly = false }: { busy: boolean; onSave: (body: unknown) => Promise<void>; touristOnly?: boolean }) {
  const [draft, setDraft] = useState(() => blank(touristOnly));
  const [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false);
  const update = (key: keyof ReturnType<typeof blank>, value: string) => setDraft(current => ({ ...current, [key]: value }));
  return <form aria-label="Cadastrar local" className="bg-white border rounded-2xl p-5 space-y-4" onSubmit={async event => {
    event.preventDefault(); setError('');
    try {
      const lat = Number(draft.lat.replace(',', '.')), lng = Number(draft.lng.replace(',', '.'));
      if (!draft.lat.trim() || !draft.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Informe latitude e longitude válidas para o local.');
      await onSave({ ...draft, lat, lng }); setDraft(blank(touristOnly)); setConfirmed(false);
    } catch (error) { setError((error as Error).message); }
  }}>
    <h3 className="font-bold">{touristOnly ? 'Cadastrar ponto turístico' : 'Cadastrar local'}</h3>
    <div className="grid md:grid-cols-2 gap-3">
      <label className="text-xs font-semibold">Tipo de local<select aria-label="Tipo de local" value={draft.kind} onChange={event => update('kind', event.target.value)} className={`${inputClass} mt-1`}>{PLACE_KINDS.filter(kind => !touristOnly || (TOURIST_PLACE_KINDS as readonly string[]).includes(kind.id)).map(kind => <option key={kind.id} value={kind.id}>{kind.icon} {kind.label}</option>)}</select></label>
      <label className="text-xs font-semibold">Nome do local<input required maxLength={150} value={draft.name} onChange={event => update('name', event.target.value)} placeholder="Nome do estabelecimento ou atração" className={`${inputClass} mt-1`} /></label>
      <label className="md:col-span-2 text-xs font-semibold">Endereço ou acesso<input required maxLength={250} value={draft.address} onChange={event => update('address', event.target.value)} placeholder="Rua, número, cidade/UF ou estrada de acesso" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Latitude<input required inputMode="decimal" value={draft.lat} onChange={event => update('lat', event.target.value)} placeholder="Ex.: -23.55052" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Longitude<input required inputMode="decimal" value={draft.lng} onChange={event => update('lng', event.target.value)} placeholder="Ex.: -46.63331" className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Telefone<input type="tel" maxLength={50} value={draft.phone} onChange={event => update('phone', event.target.value)} className={`${inputClass} mt-1`} /></label>
      <label className="text-xs font-semibold">Site do local<input type="url" maxLength={300} value={draft.website} onChange={event => update('website', event.target.value)} placeholder="https://" className={`${inputClass} mt-1`} /></label>
      <label className="md:col-span-2 text-xs font-semibold">Horário de funcionamento<input maxLength={200} value={draft.openingHours} onChange={event => update('openingHours', event.target.value)} placeholder="Ex.: Seg a sex, das 8h às 18h" className={`${inputClass} mt-1`} /></label>
    </div>
    <p className="text-xs text-slate-500">Copie a latitude e a longitude do ponto no mapa. A posição define onde o local aparece para os viajantes.</p>
    <label className="block text-xs font-semibold">Descrição<textarea maxLength={1000} value={draft.description} onChange={event => update('description', event.target.value)} className={`${inputClass} mt-1`} /></label>
    <label className="flex items-start gap-2 text-xs"><input required type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5" />Conferi o nome, o endereço e a localização deste local.</label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <button disabled={busy} className={`${buttonClass} bg-emerald-600 text-white border-emerald-600`}>{busy ? 'Cadastrando...' : 'Cadastrar e publicar no mapa'}</button>
  </form>;
}

import React, { useEffect, useState } from 'react';
import { fuelApi } from '../../services/fuelApi';
import { FUEL_OPTIONS, type FuelKind, type PriceDraft } from '../../types/fuel';
import type { PageResult, PendingPrice, ReviewPhoto } from '../../types/admin';
import { PriceEditor } from '../PriceEditor';
import { History, Pager, buttonClass, inputClass, stamp } from './shared';

const empty = <T,>(): PageResult<T> => ({ items: [], total: 0, page: 1, pageSize: 20 });
export function FuelQueue({ onChange }: { onChange: () => void }) {
  const [photos, setPhotos] = useState(empty<ReviewPhoto>), [prices, setPrices] = useState(empty<PendingPrice>);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const loadPhotos = (page = photos.page) => fuelApi<PageResult<ReviewPhoto>>(`/admin/photos?page=${page}`).then(setPhotos);
  const loadPrices = (page = prices.page) => fuelApi<PageResult<PendingPrice>>(`/admin/prices?page=${page}`).then(setPrices);
  const reload = async () => { await Promise.all([loadPhotos(), loadPrices()]); onChange(); };
  useEffect(() => { Promise.all([loadPhotos(1), loadPrices(1)]).catch(error => setError(error.message)); }, []);
  const act = async (path: string, body: unknown, message: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await fuelApi(path, { method: 'POST', body: JSON.stringify(body) }); await reload(); setMessage(message); }
    catch (error) { setError((error as Error).message); throw error; } finally { setBusy(false); }
  };
  return <div className="space-y-6"><div><h2 className="text-xl font-bold">Preços de combustíveis</h2><p className="text-sm text-slate-500 mt-1">Fotos mais recentes primeiro. Confira a placa, o posto e a data antes de publicar.</p></div>
    {error && <p role="alert" className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm">{error}</p>}{message && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-sm">{message}</p>}
    <h3 className="font-bold">Fotos pendentes</h3>
    {!photos.total && <p className="text-sm text-slate-500">Nenhuma foto aguardando análise.</p>}
    {photos.items.map(photo => <PhotoCard key={photo.id} photo={photo} busy={busy}
      onPublish={(prices, observedAt) => act(`/admin/stations/${encodeURIComponent(photo.stationId)}/prices`, { photoId: photo.id, prices, observedAt, confirmed: true }, 'Preços aprovados e publicados.')}
      onReview={(action, notes) => act(`/admin/review/photos/${photo.id}`, { action, notes }, action === 'request_new' ? 'Nova foto solicitada. O motivo aparece para o viajante.' : 'Foto rejeitada.')} />)}
    <Pager result={photos} onPage={page => loadPhotos(page).catch(error => setError(error.message))} />
    <h3 className="font-bold">Valores enviados manualmente</h3><p className="text-xs text-slate-500">Esses valores também exigem sua conferência e aprovação.</p>
    {prices.items.map(price => <article key={price.id} className="bg-white border rounded-2xl p-5 space-y-3"><strong>{price.stationName}</strong><p className="text-xs text-slate-500">{price.address || 'Endereço não informado no mapa'} · {price.contributor} · {stamp(price.observedAt)}</p>
      {price.photoId && <img loading="lazy" src={`/api/photos/${price.photoId}`} alt={`Evidência de ${price.stationName}`} className="max-h-64 object-contain rounded-xl" />}
      <PriceEditor busy={busy} observedAt={price.observedAt} initial={[{ fuelType: price.fuelType as FuelKind, customLabel: price.customLabel, price: price.price }]}
        onSubmit={(prices, observedAt) => act(`/admin/stations/${encodeURIComponent(price.stationId)}/prices`, { prices, observedAt, pendingPriceId: price.id, photoId: price.photoId || null, confirmed: true }, 'Preço aprovado e publicado.')} />
      <button disabled={busy} className={`${buttonClass} text-rose-700`} onClick={() => act(`/admin/review/prices/${price.id}`, { action: 'reject' }, 'Preço rejeitado.').catch(() => {})}>Rejeitar valor de {FUEL_OPTIONS.find(f => f.id === price.fuelType)?.label}</button>
    </article>)}
    {!prices.total && <p className="text-sm text-slate-500">Nenhum valor manual pendente.</p>}
    <Pager result={prices} onPage={page => loadPrices(page).catch(error => setError(error.message))} />
  </div>;
}
function PhotoCard({ photo, busy, onPublish, onReview }: { photo: ReviewPhoto; busy: boolean; onPublish: (prices: PriceDraft[], date: string) => Promise<void>; onReview: (action: string, notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState('');
  return <article className="bg-white border rounded-2xl p-5 space-y-4"><div><h3 className="font-bold">{photo.stationName}</h3><p className="text-sm text-slate-500">{photo.address || 'Endereço não informado no mapa'}</p><p className="text-xs text-slate-500 mt-1">Enviada em {stamp(photo.createdAt)} por {photo.contributor} · Foto de {stamp(photo.observedAt)}</p></div>
    <div className="grid lg:grid-cols-2 gap-5 items-start"><a href={`/api/photos/${photo.id}`} target="_blank" rel="noopener noreferrer" className="bg-slate-50 rounded-xl p-3 block"><img loading="lazy" src={`/api/photos/${photo.id}`} alt={`Foto dos preços de ${photo.stationName}`} className="w-full max-h-96 object-contain" /><span className="text-xs text-emerald-700 mt-2 block">Abrir foto maior</span></a><PriceEditor busy={busy} observedAt={photo.observedAt} onSubmit={onPublish} /></div>
    <History items={photo.history} />
    <label className="block text-xs font-semibold">Motivo da rejeição ou pedido de nova foto<input maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} mt-1`} /></label>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => onReview('reject', notes).catch(() => {})} className={`${buttonClass} text-rose-700`}>Rejeitar</button><button disabled={busy || !notes.trim()} onClick={() => onReview('request_new', notes).catch(() => {})} className={`${buttonClass} text-amber-800`}>Solicitar nova foto</button></div>
  </article>;
}
